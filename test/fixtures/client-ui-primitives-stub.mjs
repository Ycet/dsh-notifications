// 官方开关组件由 DSH 前端在运行时通过静态模块表提供，Node 单元测试不渲染设置页。
// 这里仅提供同名导出的桩，用于让 `src/client.js` 的模块解析在测试环境成立。
export function Switch() {
  throw new Error("client-ui-primitives stub: Switch 只应在 DSH 客户端运行时渲染");
}
