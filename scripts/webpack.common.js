const WebpackBar = require('webpackbar');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { resolve, PROJECT_PATH } = require('./constants');

module.exports = {
  // 定义了入口文件路径
  entry: {
    index: resolve(PROJECT_PATH, './packages/web/src/index.ts'),
  },
  // 定义了编译打包之后的文件名以及所在路径。还有打包的模块类型
  output: {
    // 打包后的产物名
    filename: 'WebVitals.js',
    // 在全局变量中增加一个libraryStarter变量
    library: 'createWebVitals',
    // 打包成umd模块
    libraryTarget: 'umd',
    // libraryExport这个属性需要设置，否则导出后，外层会包有一层default
    libraryExport: 'default',
    // 路径
    path: resolve(PROJECT_PATH, './dist'),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../packages'),
      '@docs': resolve(__dirname, '../docs'),
      '@public': resolve(__dirname, '../public'),
      '@test': resolve(__dirname, '../test'),
      '@websrc': resolve(__dirname, '../packages/web/src'),
    },
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.(ts)$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(js)$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new WebpackBar({
      name: '正在卖力打包中, v50可加快速度哦!!!',
      color: '#fa8c16',
    }),
    new HtmlWebpackPlugin({
      template: resolve(PROJECT_PATH, './public/index.html'),
      scriptLoading: 'blocking',
    }),
  ],
};
