import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Announcement = sequelize.define("Announcement", {
  title: { type: DataTypes.STRING(255), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM("draft", "published"),
    allowNull: false,
    defaultValue: "published"
  },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  creatorId: { type: DataTypes.INTEGER, allowNull: true },
  audience: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "all" },
  recipientIds: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  recipientRoles: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
  deletedAt: { type: DataTypes.DATE, allowNull: true }
});

