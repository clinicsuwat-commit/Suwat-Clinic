from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
out=Path(__file__).resolve().parent.parent/'line-richmenu-th-en.png'
W,H=2500,1686
im=Image.new('RGB',(W,H),'#f6faf7'); d=ImageDraw.Draw(im)
reg='/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'
bold='/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf'
ftr=ImageFont.truetype(reg,64);ftb=ImageFont.truetype(bold,84);ftsmall=ImageFont.truetype(reg,40)
color='#146f5c'
tiles=[('จองคิว','Book now','calendar'),('ร้านค้า','Shop','shop'),('การนัดหมาย','My visits','calendar'),('คำสั่งซื้อ','My orders','package'),('บัญชีของฉัน','My account','user'),('ติดต่อคลินิก','Contact staff','chat')]
def centered(txt,font,fill,cx,y):
    box=d.textbbox((0,0),txt,font=font)
    d.text((cx-(box[2]-box[0])/2,y),txt,font=font,fill=fill)
for i,(thai,english,icon) in enumerate(tiles):
    x=i%3*(W//3); y=i//3*(H//2);x2=(i%3+1)*(W//3) if i%3<2 else W;y2=y+H//2
    d.rounded_rectangle((x+18,y+18,x2-18,y2-18),radius=58,fill='#ffffff',outline='#d9e9de',width=3)
    cx=(x+x2)//2;cy=y+245
    d.rounded_rectangle((cx-100,cy-100,cx+100,cy+100),radius=49,fill='#e5f3ea')
    if icon=='calendar':
        d.rounded_rectangle((cx-50,cy-43,cx+50,cy+47),radius=10,outline=color,width=9)
        d.line((cx-50,cy-15,cx+50,cy-15),fill=color,width=8)
        d.line((cx-29,cy-64,cx-29,cy-26),fill=color,width=8)
        d.line((cx+29,cy-64,cx+29,cy-26),fill=color,width=8)
    elif icon=='shop':
        d.polygon([(cx-58,cy-25),(cx+58,cy-25),(cx+44,cy+55),(cx-44,cy+55)],outline=color)
        d.line([(cx-58,cy-25),(cx+58,cy-25),(cx+44,cy+55),(cx-44,cy+55),(cx-58,cy-25)],fill=color,width=8)
        d.arc((cx-35,cy-75,cx+35,cy+5),180,360,fill=color,width=8)
    elif icon=='package':
        d.polygon([(cx,cy-64),(cx+59,cy-28),(cx,cy+4),(cx-59,cy-28)],outline=color)
        d.line([(cx,cy-64),(cx+59,cy-28),(cx,cy+4),(cx-59,cy-28),(cx,cy-64)],fill=color,width=8)
        d.line([(cx-59,cy-28),(cx-59,cy+39),(cx,cy+74),(cx+59,cy+39),(cx+59,cy-28)],fill=color,width=8)
        d.line([(cx,cy+4),(cx,cy+74)],fill=color,width=8)
    elif icon=='user':
        d.ellipse((cx-32,cy-67,cx+32,cy-3),outline=color,width=8)
        d.arc((cx-66,cy-6,cx+66,cy+100),180,360,fill=color,width=8)
    else:
        d.rounded_rectangle((cx-60,cy-55,cx+60,cy+42),radius=22,outline=color,width=8)
        d.polygon([(cx-24,cy+37),(cx-24,cy+68),(cx+12,cy+37)],fill='#e5f3ea',outline=color)
        for off in (-25,0,25):d.ellipse((cx+off-5,cy-13,cx+off+5,cy-3),fill=color)
    centered(thai,ftb,'#1b3d32',cx,y+456)
    centered(english,ftr,'#658b7b',cx,y+583)
    centered('SUWAT CLINIC',ftsmall,'#b4c6b9',cx,y+686)
im.save(out,optimize=True)
print(out)
