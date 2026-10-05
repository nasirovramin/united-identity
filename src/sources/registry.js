// Approved United Identity sources. Each source gets its own adapter over time.
export const WEB_SOURCES=[
 ["the-brandidentity","The Brand Identity","https://the-brandidentity.com/"],
 ["pentagram","Pentagram","https://www.pentagram.com/work/"],
 ["studio-dumbar","Studio Dumbar","https://studiodumbar.com/"],
 ["wolff-olins","Wolff Olins","https://www.wolffolins.com/work"],
 ["landor","Landor","https://landor.com/"],
 ["plenum","Plenum","https://plenum.ru/"],
 ["base-design","Base Design","https://basedesign.com/"],
 ["lava","LAVA","https://lava.nl/"],
 ["johnson-banks","Johnson Banks","https://johnsonbanks.co.uk/"],
 ["shuka","Shuka","https://shuka.design/"],
 ["kokoro-moi","Kokoro & Moi","https://kokoromoi.com/work"],
 ["tsto","TSTO","https://tsto.org/"],
 ["dixonbaxi","DixonBaxi","https://www.dixonbaxi.com/case-study/dailypay"],
 ["wewantmore","WeWantMore","https://wewantmore.studio/"],
 ["studio-blackburn","Studio Blackburn","https://studioblackburn.com/"],
 ["bpando","BP&O","https://bpando.org/"],
 ["hispanica","Hispanica","https://hispanica.mx/"],
 ["world-brand-design","World Brand Design Society","https://worldbranddesign.com/"]
].map(([id,name,url])=>({id,name,url,type:"web"}));

export const TELEGRAM_SOURCES=[
 "LS_ArtDirection","Leonid_Slavin_HSE_ArtDirection","morrre_dsgn","designsniper","fourdesign","graphicstory",
 "dsgngood","designpub","paradigm_graphics","DSGN_review","mozhno","naukadsgn"
].map(id=>({id:"tg-"+id.toLowerCase(),name:id,type:"telegram",url:"https://t.me/"+id}));

export const APPROVED_SOURCES=[...WEB_SOURCES,...TELEGRAM_SOURCES];
