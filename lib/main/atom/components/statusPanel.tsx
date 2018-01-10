import * as etch from "etch"
import {dirname} from "path"
import {getFilePathRelativeToAtomProject, openFile} from "../utils"

export interface Props extends JSX.Props {
  version?: string
  pending?: string[]
  tsConfigPath?: string
  buildStatus?: {success: boolean}
  progress?: {max: number; value: number}
  visible: boolean
}

export class StatusPanel implements JSX.ElementClass {
  private configPath?: string
  private pendingRequests: string[]
  public props: Props

  constructor(props: Partial<Props> = {}) {
    this.props = {
      visible: true,
      ...props,
    }
    etch.initialize(this)
  }

  public async update(props: Partial<Props>) {
    this.props = {...this.props, ...props}
    await etch.update(this)
  }

  public render() {
    return (
      <ts-status-panel className={this.props.visible ? "" : "hide"}>
        {this.renderVersion()}
        {this.renderPending()}
        {this.renderConfigPath()}
        {this.renderStatus()}
        {this.renderProgress()}
      </ts-status-panel>
    )
  }

  public async destroy() {
    await etch.destroy(this)
  }

  public dispose() {
    this.destroy()
  }

  private openConfigPath() {
    if (this.configPath && !this.configPath.startsWith("/dev/null")) {
      openFile(this.configPath)
    } else {
      atom.notifications.addInfo("No tsconfig for current file")
    }
  }

  private showPendingRequests() {
    if (this.pendingRequests) {
      atom.notifications.addInfo(
        "Pending Requests: <br/> - " + this.pendingRequests.join("<br/> - "),
      )
    }
  }

  public show() {
    this.update({visible: true})
  }

  public hide() {
    this.update({visible: false})
  }

  private renderVersion(): JSX.Element | null {
    if (this.props.version) {
      return (
        <div ref="version" className="inline-block">
          {this.props.version}
        </div>
      )
    }
    return null
  }

  private renderPending(): JSX.Element | null {
    if (this.props.pending && this.props.pending.length) {
      return (
        <a
          ref="pendingContainer"
          className="inline-block"
          href=""
          on={{
            click: evt => {
              evt.preventDefault()
              this.showPendingRequests()
            },
          }}>
          <span ref="pendingCounter">{this.props.pending.length.toString()}</span>
          <span
            ref="pendingSpinner"
            className="loading loading-spinner-tiny inline-block"
            style={{marginLeft: "5px", opacity: "0.5", verticalAlign: "sub"}}
          />
        </a>
      )
    }
    return null
  }

  private renderConfigPath(): JSX.Element | null {
    if (this.props.tsConfigPath) {
      return (
        <a
          ref="configPathContainer"
          className="inline-block"
          href=""
          on={{
            click: evt => {
              evt.preventDefault()
              this.openConfigPath()
            },
          }}>
          {this.props.tsConfigPath.startsWith("/dev/null")
            ? "No project"
            : dirname(getFilePathRelativeToAtomProject(this.props.tsConfigPath))}
        </a>
      )
    }
    return null
  }

  private renderStatus(): JSX.Element | null {
    if (this.props.buildStatus) {
      let cls: string
      let text: string
      if (this.props.buildStatus.success) {
        cls = "highlight-success"
        text = "Emit Success"
      } else {
        cls = "highlight-error"
        text = "Emit Failed"
      }
      return (
        <div ref="statusContainer" className="inline-block">
          <span ref="statusText" class={cls}>
            {text}
          </span>
        </div>
      )
    }
    return null
  }

  private renderProgress(): JSX.Element | null {
    if (this.props.progress) {
      return (
        <progress
          ref="progress"
          style={{verticalAlign: "baseline"}}
          className="inline-block"
          max={this.props.progress.max}
          value={this.props.progress.value}
        />
      )
    }
    return null
  }
}
