module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin powers Reanimated 4 (and Moti). It MUST be last.
    plugins: ['react-native-worklets/plugin'],
  };
};
