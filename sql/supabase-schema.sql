-- SUWAT CLINIC / SUPABASE SCHEMA BLUEPRINT (Phase 2 migration)
-- IMPORTANT: The downloadable Node MVP currently runs on SQLite for local testing.
-- This SQL provides the planned PostgreSQL model. It is NOT automatically wired
-- to server.mjs; use a PostgreSQL adapter and transaction-safe RPCs before going live.
-- No sample products, real patient records, secrets, or LINE channel credentials here.
create extension if not exists pgcrypto;
create table if not exists public.sc_customers (
 id uuid primary key default gen_random_uuid(),
 line_user_id text unique not null,
 display_name text not null default '',
 phone text,
 phone_verified_at timestamptz,
 preferred_lang text not null default 'th' check (preferred_lang in ('th','en')),
 created_at timestamptz not null default now()
);
create table if not exists public.sc_slot_rules (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 name_th text not null,
 name_en text not null,
 start_time time not null,
 end_time time not null,
 capacity integer not null check(capacity between 0 and 500),
 active boolean not null default true,
 check(start_time < end_time)
);
create table if not exists public.sc_date_overrides (
 date date not null,
 slot_id uuid not null references public.sc_slot_rules(id),
 capacity integer check(capacity between 0 and 500),
 closed boolean not null default false,
 primary key(date,slot_id)
);
create table if not exists public.sc_bookings (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 customer_id uuid not null references public.sc_customers(id),
 patient_name text not null,
 patient_phone text not null,
 appointment_date date not null,
 slot_id uuid not null references public.sc_slot_rules(id),
 symptoms text,
 status text not null check (status in ('pending','confirmed','checked_in','completed','cancelled','no_show')),
 idempotency_key text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists sc_bookings_slot_idx on public.sc_bookings(appointment_date,slot_id,status);
create table if not exists public.sc_products (
 id uuid primary key default gen_random_uuid(),
 sku text not null unique,
 title_th text not null,title_en text not null,
 description_th text not null default '',description_en text not null default '',
 price_satang integer not null check(price_satang>=0),
 image_path text,
 registration_no text,
 active boolean not null default false
);
create table if not exists public.sc_inventory_lots (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.sc_products(id),
 lot_no text not null,
 expires_at date not null,
 available_qty integer not null check(available_qty>=0),
 unique(product_id,lot_no)
);
create table if not exists public.sc_orders (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 customer_id uuid not null references public.sc_customers(id),
 total_satang integer not null check(total_satang>=0),
 payment_status text not null default 'unverified' check(payment_status in ('unverified','verified','refunded')),
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','confirmed','packing','shipped','delivered','cancelled')),
 delivery_method text not null check(delivery_method in ('pickup','shipping')),
 shipping_address text,
 carrier text,
 tracking_no text,
 idempotency_key text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.sc_order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.sc_orders(id),
 product_id uuid not null references public.sc_products(id),
 title_th text not null,title_en text not null,
 qty integer not null check(qty>0), unit_price_satang integer not null check(unit_price_satang>=0)
);
create table if not exists public.sc_order_allocations (
 order_id uuid not null references public.sc_orders(id),
 lot_id uuid not null references public.sc_inventory_lots(id),
 qty integer not null check(qty>0),
 primary key(order_id,lot_id)
);
create table if not exists public.sc_stock_movements (
 id uuid primary key default gen_random_uuid(),
 lot_id uuid not null references public.sc_inventory_lots(id),
 delta integer not null,
 reason text not null,
 actor_id text,
 created_at timestamptz not null default now()
);
create table if not exists public.sc_staff (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique,
 display_name text not null,
 role text not null check(role in ('owner','manager','reception','store','clinical')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.sc_tasks (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('booking','order')),
 reference_id uuid not null,
 title text not null,
 status text not null default 'new' check(status in ('new','acknowledged','done')),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create table if not exists public.sc_task_acknowledgements (
 task_id uuid not null references public.sc_tasks(id),
 staff_id uuid not null references public.sc_staff(id),
 acknowledged_at timestamptz not null default now(),
 primary key(task_id,staff_id)
);
create table if not exists public.sc_notification_outbox (
 id uuid primary key default gen_random_uuid(),
 kind text not null,
 destination_type text not null check(destination_type in ('customer','group')),
 recipient_line_id text not null,
 payload jsonb not null,
 status text not null default 'pending',
 attempts integer not null default 0,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.sc_audit_logs (
 id bigint generated always as identity primary key,
 actor text not null,
 action text not null,
 target text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
-- Security-first default: no public table access. Expose narrowly scoped RPCs
-- through a server that verifies LINE ID tokens and staff authorization.
DO $ddl$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'sc_customers','sc_slot_rules','sc_date_overrides','sc_bookings','sc_products',
 'sc_inventory_lots','sc_orders','sc_order_items','sc_order_allocations',
 'sc_stock_movements','sc_staff','sc_tasks','sc_task_acknowledgements',
 'sc_notification_outbox','sc_audit_logs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon,authenticated',t);
 END LOOP;
END $ddl$;
-- Next production step: implement atomic booking and FEFO stock allocation
-- using PostgreSQL transactions (SELECT ... FOR UPDATE) in SECURITY DEFINER
-- RPCs restricted to service_role, or a dedicated secure backend.
