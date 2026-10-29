import { sequelize } from './models/db.js';
import { Announcement } from './models/announcementModel.js';
import { AnnouncementNotification } from './models/notificationModel.js';
// Explicit, additive only. Never sync({force:true}) or sync({alter:true}).
try {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  // Validate existing base tables before applying any additive DDL.
  await qi.describeTable('Users');
  const columns = await qi.describeTable(Announcement.tableName);
  for (const name of ['creatorId', 'audience', 'recipientIds', 'recipientRoles', 'archivedAt', 'deletedAt']) {
    if (!columns[name]) {
      const definition = { ...Announcement.rawAttributes[name] };
      // MySQL JSON defaults vary by version; backfill without replacing records.
      if (['recipientIds', 'recipientRoles'].includes(name)) {
        await qi.addColumn(Announcement.tableName, name, { type: definition.type, allowNull: true });
        await sequelize.query(`UPDATE \`Announcements\` SET \`${name}\` = JSON_ARRAY() WHERE \`${name}\` IS NULL`);
      } else await qi.addColumn(Announcement.tableName, name, definition);
    }
  }
  await AnnouncementNotification.sync();
  console.log('Additive announcement migration complete. Existing owners remain unknown.');
} catch { console.error('Migration failed. Check database connectivity and schema; existing data was not reset.'); process.exitCode = 1; }
finally { await sequelize.close(); }
