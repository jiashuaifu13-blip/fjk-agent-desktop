import { useState } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'pill'

const VARIANTS: Array<{ key: Variant; label: string }> = [
  { key: 'primary', label: '主要 Primary' },
  { key: 'secondary', label: '次要 Secondary' },
  { key: 'ghost', label: '幽灵 Ghost' },
  { key: 'danger', label: '危险 Danger' },
  { key: 'pill', label: '胶囊 Pill' },
]

export function StyleLab({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  return (
    <div className="fjk-lab" role="dialog" aria-label="风格样张">
      <div className="fjk-lab-panel">
        <header className="fjk-lab-head">
          <div>
            <div className="fjk-lab-kicker">STYLE LAB · BLUE ARCHIVE INSPIRED</div>
            <h1>
              FJK <span>Agent</span>
            </h1>
            <p>蔚蓝档案式 · 明亮面板 + 单一亮蓝 + 樱粉点缀 + 光环母题（中等强度）</p>
          </div>

          <button type="button" className="fjk-lab-close" onClick={onClose} aria-label="关闭样张">
            ×
          </button>
        </header>

        <section className="fjk-lab-section">
          <h2>按钮 · 五种变体 × 状态</h2>

          <div className="fjk-lab-grid">
            {VARIANTS.map(({ key, label }) => (
              <div className="fjk-lab-variant" key={key}>
                <div className="fjk-lab-label">{label}</div>
                <div className="fjk-lab-row">
                  <button type="button" className={`ba-btn ba-btn--${key}`}>
                    默认
                  </button>
                  <button type="button" className={`ba-btn ba-btn--${key}`} disabled>
                    禁用
                  </button>
                  <button
                    type="button"
                    className={`ba-btn ba-btn--${key}${loading ? ' is-loading' : ''}`}
                    onClick={() => {
                      setLoading(true)
                      window.setTimeout(() => setLoading(false), 1600)
                    }}
                  >
                    加载
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="fjk-lab-hint">鼠标悬停看上浮与光晕，按下看下压动效，Tab 看焦点环。</p>
        </section>

        <section className="fjk-lab-section">
          <h2>能力卡 · 悬浮效果</h2>

          <div className="fjk-lab-cards">
            {[
              { icon: '〈/〉', title: '编写与修改代码', desc: '理解项目，协助实现功能' },
              { icon: '▱', title: '运行与管理任务', desc: '命令、构建与调试' },
              { icon: '✦', title: '协作与创作', desc: '分析、写作与解答' },
            ].map((item) => (
              <article className="ba-card" key={item.title}>
                <span className="ba-card-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <strong>{item.title}</strong>
                <small>{item.desc}</small>
                <span className="ba-card-halo" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="fjk-lab-section">
          <h2>面板 · 输入框 · 审批卡</h2>

          <div className="fjk-lab-panels">
            <div className="ba-panel">
              <div className="ba-panel-head">
                <span>会话</span>
                <button type="button" className="ba-icon-btn" aria-label="关闭">
                  ×
                </button>
              </div>
              <ul className="ba-list">
                <li className="is-active">
                  <span className="ba-dot" /> 主会话
                </li>
                <li>
                  <span className="ba-dot" /> 会话 · 9f2a1c33
                </li>
                <li>
                  <span className="ba-dot" /> 会话 · 7c11e0aa
                </li>
              </ul>
            </div>

            <div className="ba-composer">
              <span className="ba-composer-mark" aria-hidden="true">
                ◈
              </span>
              <input placeholder="输入消息，Enter 发送" />
              <button type="button" className="ba-send" aria-label="发送">
                ➤
              </button>
            </div>

            <div className="ba-approval">
              <div className="ba-approval-head">
                <span className="ba-approval-badge">!</span>
                审批请求
              </div>
              <code>cmd /c mkdir D:\pet-desp\demo</code>
              <div className="ba-approval-actions">
                <button type="button" className="ba-btn ba-btn--primary">
                  允许一次
                </button>
                <button type="button" className="ba-btn ba-btn--secondary">
                  记住 30 分钟
                </button>
                <button type="button" className="ba-btn ba-btn--danger">
                  拒绝
                </button>
              </div>
            </div>
          </div>
        </section>

        <footer className="fjk-lab-foot">
          <span>这套风格满意就回复「定稿」，我按它铺到主界面。</span>
          <button type="button" className="ba-btn ba-btn--primary" onClick={onClose}>
            关闭样张
          </button>
        </footer>
      </div>
    </div>
  )
}
