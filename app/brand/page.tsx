import Link from "next/link";
import { BrandLogo } from "../../components/BrandLogo";

const logoSpecs = [
  ["字体", "DM Sans", "现代、清晰、亲近"],
  ["字重", "600 / Semibold", "稳固但不过分强硬"],
  ["字距", "-0.06em", "让字标成为一个整体"],
  ["句点", "#ff5a1f", "品牌不可丢失的情绪锚点"],
] as const;

export default function BrandPage() {
  return (
    <main className="brand-page">
      <header className="brand-nav">
        <BrandLogo href="/" />
        <Link href="/" className="brand-nav-link">返回人生模拟器 <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="brand-hero" aria-labelledby="brand-title">
        <p className="eyebrow">FINDJOY / BRAND SYSTEM 01</p>
        <h1 id="brand-title">Find joy.<br /><em>然后把它带去每一个产品。</em></h1>
        <p className="brand-lede">一个可复用的品牌字标。字形保持克制，句点保持鲜活；无论产品系列如何变化，都从同一个落点出发。</p>
      </section>

      <section className="logo-showcase" aria-labelledby="logo-showcase-title">
        <div className="section-heading"><p className="section-label">01 / PRIMARY MARK</p><h2 id="logo-showcase-title">主标志</h2></div>
        <div className="logo-stage"><BrandLogo href="/" /><p>wordmark / horizontal / light</p></div>
      </section>

      <section className="brand-grid" aria-label="标志变体与规范">
        <div className="brand-panel brand-panel--dark"><p className="section-label">ON INK</p><BrandLogo href="/" /><span className="panel-note">深色背景时只反转字色，句点仍保持橙色。</span></div>
        <div className="brand-panel brand-panel--orange"><p className="section-label">ON ORANGE</p><BrandLogo href="/" /><span className="panel-note">橙色是强调色，不承担整块背景的长期主色角色。</span></div>
        <div className="brand-panel brand-panel--small"><p className="section-label">COMPACT</p><BrandLogo href="/" compact /><span className="panel-note">用于导航、列表和密集工作流，最小建议字号 16px。</span></div>
      </section>

      <section className="spec-section" aria-labelledby="spec-title">
        <div className="section-heading"><p className="section-label">02 / DNA</p><h2 id="spec-title">字标 DNA</h2></div>
        <div className="spec-list">{logoSpecs.map(([label, value, note]) => <div className="spec-row" key={label}><span>{label}</span><strong>{value}</strong><p>{note}</p></div>)}</div>
      </section>

      <section className="inherit-section" aria-labelledby="inherit-title">
        <div><p className="section-label">03 / EXTENSION RULE</p><h2 id="inherit-title">系列产品的继承方式</h2></div>
        <div className="inherit-copy"><p>产品名称可以变化，字标结构不变。系列名接在主名之后，保持同一字重与字距；最后的橙色句点始终属于 findjoy，而不是系列名。</p><div className="series-lockup"><BrandLogo href="/" /><span>·</span><strong>studio</strong></div><code>&lt;BrandLogo /&gt; + seriesName</code></div>
      </section>

      <footer className="brand-footer"><BrandLogo href="/" compact /><span>One mark. Many ways to find joy.</span></footer>
    </main>
  );
}
