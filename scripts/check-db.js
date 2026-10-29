import { sequelize } from '../models/db.js';
import { logAnnouncementError } from '../services/announcementErrors.js';
sequelize.options.logging = false;
try {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  const userColumns = await qi.describeTable('Users');
  const announcementColumns = await qi.describeTable('Announcements');
  const required = ['creatorId','audience','recipientIds','recipientRoles','archivedAt','deletedAt'];
  const missing = required.filter(name => !announcementColumns[name]);
  if (!userColumns.role) throw new Error('Missing role schema');
  console.log('Database connection and existing base tables verified.');
  if (missing.length) {
    console.log('Announcement migration pending: ' + missing.join(', '));
    process.exitCode = 1;
  } else {
    await qi.describeTable('AnnouncementNotifications');
    console.log('Announcement schema fields and notification table verified (read-only check).');
  }
} catch (error) {
  logAnnouncementError('database-check', error);
  console.error('Database verification failed. Check the existing Docker service, credentials and schema. No data was changed.');
  process.exitCode = 1;
} finally { await sequelize.close(); }
