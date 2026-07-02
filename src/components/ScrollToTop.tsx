import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// 路由变化时滚动到顶部;但当 URL 带有 #field-... 锚点时,
// 保留浏览器/编辑页自身的滚动定位,避免与「点击标签定位字段」的滚动冲突。
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);
  return null;
};

export default ScrollToTop;
