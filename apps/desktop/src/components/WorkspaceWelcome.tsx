import { WORKSPACE_QUICK_PROMPT_EVENT } from './WorkspaceSidebar'

const prompts = [
  { icon: '⌘', label: '分析当前项目结构', prompt: '请分析当前项目结构，先说明你能读取哪些项目文件，再给出建议。' },
  { icon: '✧', label: '帮我实现新功能', prompt: '我想实现一个新功能，请先询问我需要的功能和约束。' },
  { icon: '›_', label: '运行构建命令', prompt: '请先检查当前项目的构建方式，说明你准备运行的命令，并在需要时请求审批。' },
  { icon: '≡', label: '查看运行日志', prompt: '' },
]

export function WorkspaceWelcome({ ready }: { ready: boolean }) {
  return (
    <div className="fjk-welcome">
      <div className="fjk-welcome-copy">
        <div className="fjk-welcome-kicker">YOUR PERSONAL DESKTOP AGENT</div>
        <p className="fjk-welcome-greeting">你好，我是</p>
        <h1>FJK <span>Agent</span></h1>
        <p className="fjk-welcome-description">你的桌面 AI 助手，与桌宠一起完成开发、创作和日常任务。</p>
        <div className="fjk-capability-grid" aria-label="核心能力">
          <div className="fjk-capability"><span aria-hidden="true">〈/〉</span><strong>编写与修改代码</strong><small>理解项目，协助实现功能</small></div>
          <div className="fjk-capability"><span aria-hidden="true">▱</span><strong>运行与管理任务</strong><small>命令、构建与调试</small></div>
          <div className="fjk-capability"><span aria-hidden="true">✦</span><strong>协作与创作</strong><small>分析、写作与解答</small></div>
        </div>
        <div className="fjk-prompt-heading">试试这些</div>
        <div className="fjk-prompt-row">
          {prompts.map(({ icon, label, prompt }) =>
            <button key={label} type="button" disabled={!ready && !!prompt}
              onClick={() => window.dispatchEvent(new CustomEvent(WORKSPACE_QUICK_PROMPT_EVENT, { detail: { prompt, action: prompt ? 'fill' : 'log' } }))}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          )}
        </div>
      </div>
      <div className="fjk-pet-scenery" aria-hidden="true">
        <div className="fjk-pet-orbit" />
        <div className="fjk-pet-platform" />
      </div>
    </div>
  )
}
