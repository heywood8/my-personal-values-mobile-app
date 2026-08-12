/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema: './app/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
};
