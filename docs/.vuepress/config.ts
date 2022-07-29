import { defineUserConfig } from "vuepress";
import { DefaultThemeOptions, defaultTheme } from "vuepress";
const packageJson = require("../../package.json");

export default defineUserConfig({
  // 站点配置
  title: packageJson.name,
  description: packageJson.description,

  base: "/typescript-sdk-starter/",

  // 主题和它的配置
  theme: defaultTheme({
    navbar: [
      {
        text: "首页",
        link: "/",
      },
      {
        text: "指南",
        link: "/guide/",
      },
      {
        text: "API",
        link: "/api/",
      },
      {
        text: "GitHub",
        link: "https://github.com/acwink/bytedance-project-team-sdk#readme",
      },
    ],
  }),
});
