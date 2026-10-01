// 图形来自 00_assets/icons/dsh-account-usage/通知.svg；内联后安装包无需依赖本机素材目录。
export const NOTIFICATION_ICON_PATH = "M861.575529 783.058824a30.117647 30.117647 0 0 1-30.117647-30.117648V378.096941C831.457882 202.541176 689.152 60.235294 513.626353 60.235294 338.070588 60.235294 195.764706 202.541176 195.764706 378.096941V752.941176a30.117647 30.117647 0 0 1-30.117647 30.117648H105.411765v60.235294h813.17647v-60.235294h-57.012706zM918.588235 722.823529a60.235294 60.235294 0 0 1 60.235294 60.235295v60.235294a60.235294 60.235294 0 0 1-60.235294 60.235294H105.411765a60.235294 60.235294 0 0 1-60.235294-60.235294v-60.235294a60.235294 60.235294 0 0 1 60.235294-60.235295h30.117647V378.096941C135.529412 169.261176 304.790588 0 513.626353 0c208.805647 0 378.066824 169.261176 378.066823 378.096941V722.823529H918.588235z m-481.882353 210.82353h180.705883a90.352941 90.352941 0 0 1-180.705883 0z";
const MARK = "data-dsh-notifications-nav-icon";
const mask = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="' + NOTIFICATION_ICON_PATH + '"/></svg>') + '")';

// 桌面设置壳层忽略自定义 icon，用遮罩显示指定图形；保留 React 管理的 SVG 节点。
export const NOTIFICATION_NAV_ICON_CSS = `
[${MARK}] > svg:first-child,[${MARK}] > span:first-child svg{width:16px;height:16px;background:currentColor;-webkit-mask:${mask} center/contain no-repeat;mask:${mask} center/contain no-repeat}
[${MARK}] > svg:first-child > *,[${MARK}] > span:first-child svg > *{visibility:hidden}
`;

export function notificationNavIcon(React) {
  return React.createElement("svg", {
    viewBox: "0 0 1024 1024", width: 16, height: 16,
    "aria-hidden": true, focusable: "false"
  }, React.createElement("path", { d: NOTIFICATION_ICON_PATH, fill: "currentColor" }));
}

export function installNotificationNavIcon(t, environment = globalThis) {
  const { document, MutationObserver } = environment;
  if (!document?.querySelectorAll) return () => {};
  const rows = '[role="dialog"] nav button';
  const text = value => String(value || "").replace(/\s+/g, " ").trim();
  const sync = () => {
    let label;
    try { label = text(t("title")); } catch { return; }
    if (!label) return;
    for (const button of document.querySelectorAll(rows)) {
      const icon = button.firstElementChild;
      const hasIcon = icon?.localName === "svg" || (icon?.localName === "span" && icon.querySelector("svg"));
      if (text(button.textContent) === label && hasIcon) {
        if (!button.hasAttribute(MARK)) button.setAttribute(MARK, "true");
      } else if (button.hasAttribute(MARK)) button.removeAttribute(MARK);
    }
  };
  sync();
  // 只观察面板挂载和文字变化；自身设置属性不会触发观察器循环。
  const observer = typeof MutationObserver === "function" && document.body ? new MutationObserver(sync) : undefined;
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer?.disconnect();
    for (const button of document.querySelectorAll(`[${MARK}]`)) button.removeAttribute(MARK);
  };
}

