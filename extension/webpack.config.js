// @ts-check
const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
  target: "node",
  mode: "production",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              transpileOnly: false,
            },
          },
        ],
      },
    ],
  },
  plugins: [
    // ws optional native deps — not needed at runtime for our usage; silence webpack resolution warnings
    new webpack.IgnorePlugin({ resourceRegExp: /^utf-8-validate$/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^bufferutil$/ }),
    new CopyPlugin({
      patterns: [
        {
          from: "**/*.schema.json",
          context: path.join(__dirname, "..", "schemas"),
          to: "schemas",
        },
        {
          from: path.join(__dirname, "..", "webview-ui", "dist"),
          to: "webview-ui",
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  devtool: "nosources-source-map",
};
