require('dotenv').config({path:__dirname+'/.env'});
const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true});
  try{
    const [rows]=await c.query("SELECT id, project_id, category, images, created_at FROM project_logs WHERE images IS NOT NULL AND images != '' ORDER BY id DESC LIMIT 30");
    for(const r of rows){
      console.log(`log#${r.id} proj=${r.project_id} cat=${r.category} imgs_len=${r.images?.length} raw=${String(r.images).substring(0,100)}`);
    }
  }finally{await c.end();}
})().catch(e=>{console.error(e);process.exit(1);});
