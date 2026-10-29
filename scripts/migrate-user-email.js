import {sequelize} from '../models/db.js';
sequelize.options.logging=false;
try {
 await sequelize.authenticate();
 const qi=sequelize.getQueryInterface();
 const indexes=await qi.showIndex('Users');
 if(indexes.some(index=>index.unique&&index.fields.length===1&&index.fields[0].attribute==='email')) {
  console.log('Unique email protection already exists. No changes needed.');
 } else {
  const [duplicates]=await sequelize.query('SELECT COUNT(*) AS groups_count FROM (SELECT email FROM Users GROUP BY email HAVING COUNT(*) > 1) duplicate_emails');
  if(Number(duplicates[0].groups_count))throw new Error('Existing duplicates require review');
  await qi.addIndex('Users',['email'],{name:'users_email_unique',unique:true});
  console.log('Added unique email index. No user records were changed.');
 }
} catch {
 console.error('Email index migration could not complete. No existing records were edited or deleted. Inspect duplicate emails and database connectivity.');
 process.exitCode=1;
} finally {await sequelize.close();}
