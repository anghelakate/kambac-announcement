import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
export const AnnouncementNotification = sequelize.define("AnnouncementNotification", {
  announcementId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Announcements", key: "id" } },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" } },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, { indexes: [{ unique: true, fields: ["announcementId", "userId"] }, { fields: ["userId", "readAt"] }] });
