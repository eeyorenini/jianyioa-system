require('dotenv').config({path:__dirname+'/.env'});
const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  try{
    const [rows]=await c.query("SELECT id, images FROM project_logs WHERE project_id=15 AND images IS NOT NULL AND images!=''");
    for(const r of rows){
      let imgs=r.images;
      try{const f=JSON.parse(r.images);imgs=typeof f==='string'?JSON.parse(f):f;}catch{}
      const s=Array.isArray(imgs)?imgs[0]:'';
      console.log(`log#${r.id} 首张图 url: ${s}`);
    }
  }finally{await c.end();}
})().catch(e=>{console.error(e);process.exit(1);});
