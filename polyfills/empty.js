// Stand-in for Node built-ins that transitive dependencies import but never call
// on a React Native or web target. Metro's resolveRequest (metro.config.js)
// points every entry of that list here.
module.exports = {};
