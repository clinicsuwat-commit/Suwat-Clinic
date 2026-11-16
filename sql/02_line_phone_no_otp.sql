-- Suwat Clinic v2.2: migrate existing v2.1 Supabase installations.
-- Run this in Supabase SQL Editor ONCE before deploying updated v2.2 code.
-- No tables, customers, bookings, orders, or groups are dropped.
-- Customers must supply a 10-digit phone. Phone ownership is NOT verified by LINE Login.
-- All new self-reported-phone bookings stay PENDING for staff review.
-- Keep payment verification manual. The clinic must verify identity/contact where necessary.

begin;
insert into public.sw_settings(key,value) values ('booking_mode','manual')
on conflict(key) do update set value=excluded.value;

create or replace function public.sw_book(p_customer bigint,p_date date,p_slot text,p_patient text,p_symptoms text,p_request text)
returns public.sw_bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.sw_slot_rules%rowtype; c public.sw_customers%rowtype;
 v public.sw_bookings%rowtype; a record; m text; d text;
begin
 if p_date < (now() at time zone 'Asia/Bangkok')::date or p_date > ((now() at time zone 'Asia/Bangkok')::date+90) then
  raise exception 'Date must be within 90 days' using errcode='P0001'; end if;
 if length(trim(p_patient))<2 or length(p_patient)>100 or length(coalesce(p_symptoms,''))>500 then raise exception 'Invalid booking details' using errcode='P0001';end if;
 select * into c from public.sw_customers where id=p_customer;
 if not found or c.phone !~ '^0[0-9]{9}$' then raise exception 'Add a phone number in your account first' using errcode='P0001';end if;
 if nullif(p_request,'') is not null then
  select * into v from public.sw_bookings where customer_id=p_customer and request_id=p_request;
  if found then return v;end if;
 end if;
 select * into s from public.sw_slot_rules where key=p_slot and active for update;
 if not found then raise exception 'Unknown booking slot' using errcode='P0001';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_date::text||':'||p_slot,0));
 select * into a from public.sw_available(p_date) where key=p_slot;
 if not found or a."left"<1 then raise exception 'This time slot is fully booked' using errcode='P0001';end if;
 select value into m from public.sw_settings where key='booking_mode';
 d:='SWC-'||to_char(now() at time zone 'Asia/Bangkok','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
 insert into public.sw_bookings(booking_ref,customer_id,patient_name,patient_phone,date,slot_key,symptoms,status,request_id)
 values(d,p_customer,trim(p_patient),c.phone,p_date,p_slot,coalesce(p_symptoms,''),case when m='manual' or not c.phone_verified then 'pending' else 'confirmed' end,nullif(p_request,'')) returning * into v;
 insert into public.sw_tasks(kind,reference_id,title) values('booking',v.id,'New appointment '||v.booking_ref);
 return v;
end $$;

-- FEFO allocation under row locks. Entire order/stock operation rolls back on any failure.
create or replace function public.sw_checkout(p_customer bigint,p_items jsonb,p_delivery text,p_address text,p_request text)
returns public.sw_orders language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.sw_customers%rowtype; o public.sw_orders%rowtype;
 v record; p public.sw_products%rowtype; lot record; remaining int;take_qty int; total int:=0; ref text;
begin
 select * into c from public.sw_customers where id=p_customer;
 if not found or c.phone !~ '^0[0-9]{9}$' then raise exception 'Add a phone number in your account first' using errcode='P0001';end if;
 if p_delivery not in ('pickup','shipping') or (p_delivery='shipping' and length(trim(coalesce(p_address,'')))<12) then raise exception 'Invalid delivery details' using errcode='P0001'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Invalid cart' using errcode='P0001';end if;
 if nullif(p_request,'') is not null then
   select * into o from public.sw_orders where customer_id=p_customer and request_id=p_request;
   if found then return o;end if;
 end if;
 -- Lock all distinct product rows in ascending order before stock operations.
 for v in select (item->>'id')::bigint as pid,sum((item->>'qty')::integer)::int as qty
   from jsonb_array_elements(p_items) as t(item) group by 1 order by 1 loop
   if v.qty<1 or v.qty>50 then raise exception 'Invalid cart quantity' using errcode='P0001';end if;
   select * into p from public.sw_products where id=v.pid and active for update;
   if not found then raise exception 'Product unavailable' using errcode='P0001';end if;
   total:=total+p.price*v.qty;
 end loop;
 ref:='ORD-'||to_char(now() at time zone 'Asia/Bangkok','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
 insert into public.sw_orders(order_ref,customer_id,amount,delivery_method,shipping_address,request_id)
 values(ref,p_customer,total,p_delivery,coalesce(p_address,''),nullif(p_request,'')) returning * into o;
 for v in select (item->>'id')::bigint as pid,sum((item->>'qty')::integer)::int as qty
   from jsonb_array_elements(p_items) as t(item) group by 1 order by 1 loop
   select * into p from public.sw_products where id=v.pid;
   insert into public.sw_order_items(order_id,product_id,title_th,title_en,qty,unit_price)
   values(o.id,p.id,p.title_th,p.title_en,v.qty,p.price);
   remaining:=v.qty;
   for lot in select id,available_qty from public.sw_inventory_lots
      where product_id=p.id and expiry_date >= (now() at time zone 'Asia/Bangkok')::date
      and available_qty>0 order by expiry_date,id for update loop
     take_qty:=least(remaining,lot.available_qty);
     update public.sw_inventory_lots set available_qty=available_qty-take_qty where id=lot.id;
     insert into public.sw_order_allocations(order_id,lot_id,qty) values(o.id,lot.id,take_qty);
     insert into public.sw_stock_movements(lot_id,delta,reason,actor) values(lot.id,-take_qty,'order-reserve',ref);
     remaining:=remaining-take_qty;
     exit when remaining=0;
   end loop;
   if remaining>0 then raise exception 'Not enough stock for %',p.title_en using errcode='P0001';end if;
 end loop;
 insert into public.sw_tasks(kind,reference_id,title)values('order',o.id,'New order '||ref);
 return o;
end $$;


revoke execute on function public.sw_book(bigint,date,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.sw_checkout(bigint,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.sw_book(bigint,date,text,text,text,text) to service_role;
grant execute on function public.sw_checkout(bigint,jsonb,text,text,text) to service_role;
commit;
notify pgrst, 'reload schema';
