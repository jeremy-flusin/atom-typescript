import atomUtils = require("../utils");
import * as sp from "atom-space-pen-views";
import * as view from "./view";
import {clientResolver} from "../../atomts"
import * as dom from "jsx-render-dom"
import {NavigationTree} from "typescript/lib/protocol"

class SemanticViewRenderer {

  editor: AtomCore.IEditor;
  navTree: NavigationTree | null;
  root: HTMLElement;
  selectedNode: HTMLElement | null;

  constructor() {
    this.navTree = null;
    this.selectedNode = null;
  }

  setEditor(editor: AtomCore.IEditor) {
    this.editor = editor;
  }

  setNavTree(navTree: NavigationTree | null) {
    this.navTree = navTree;
    this._render();
  }

  forceUpdate() {
    //FIXME should this be done differently?
    this._render();
  }

  async loadNavTree(filePath?: string) {
    filePath = filePath ? filePath : this.editor.getPath();
    // const client = await clientResolver.get(filePath);
    try {
      const client = await clientResolver.get(filePath);
      await client.executeOpen({file: filePath});
      const navtreeResult = await client.executeNavTree({file: filePath as string});
      const navTree = navtreeResult ? navtreeResult.body as NavigationTree : void (0);
      if (navTree) {
        this.setNavTree(navTree);
      }
    } catch(err) {
      console.error(err, filePath);
    }
  }

  componentDidMount() {
    // We listen to a few things

    // Editor scrolling
    var editorScrolling: AtomCore.Disposable;
    // Editor changing
    var editorChanging: AtomCore.Disposable;

    let subscribeToEditor = (editor: AtomCore.IEditor) => {
      this.setEditor(editor);

      //set navTree
      const filePath = editor.getPath();
      this.loadNavTree(filePath);

      // Subscribe to stop scrolling
      editorScrolling = editor.onDidChangeCursorPosition(() => {
        this.selectAtCursorLine();
      });


      editorChanging = editor.onDidStopChanging(() => {
        //set navTree
        const filePath = editor.getPath();
        this.loadNavTree(filePath);
      })

      panel.show();
    }

    let unsubscribeToEditor = () => {
      panel.hide();
      this.setNavTree(null);
      if (!this.editor) return;

      editorScrolling.dispose();
      editorChanging.dispose();
      this.forceUpdate();
    }

    // We don't start unless there is work to do ... so work
    subscribeToEditor(atomUtils.getActiveEditor());

    // Tab changing
    atom.workspace.onDidChangeActivePaneItem((editor: AtomCore.IEditor) => {
      if (atomUtils.onDiskAndTs(editor) && showSemanticView) {
        subscribeToEditor(editor);
      }
      else {
        unsubscribeToEditor();
      }
    });
  }

  /**
   * Actually component will never unmount ... so no unsubs for now
   */
  componentWillUnmount() {
  }

  whileRendering: {lastCursorLine: number | null} = {
    lastCursorLine: 0
  }

  _render(node?: HTMLElement) {
    this.root = node ? node : this.root;
    this.whileRendering = {
      lastCursorLine: this.editor && this.editor.getLastCursor() ? this.editor.getLastCursor().getBufferRow() : null
    };
    if (!this.navTree) {
      if (this.navTree === null) {
        let child = this.root.firstChild;
        if (child)
          this.root.removeChild(child);
      }
      return;////////////// EARLY EXIT /////////////////
    }
    this.selectedNode = null;
    let content = <div>
      {this.renderNode(this.navTree, 0)}
    </div>;
    let child = this.root.firstChild;
    if (child)
      this.root.replaceChild(content, child);
    else
      this.root.appendChild(content);

    if (this.selectedNode)
      this.scrollTo(this.selectedNode);
  }

  _nodeStartLine(node: NavigationTree) {
    return node.spans[0].start.line - 1;
  }

  _nodeEndLine(node: NavigationTree) {
    let s = node.spans;
    return s[s.length - 1].end.line - 1;
  }

  renderNode(node: NavigationTree, indent: number): HTMLElement {

    let selected = this.isSelected(node);

    let domNode = <div className="node" onClick={(event) => {this.gotoNode(node); event.stopPropagation();}}>
      <span className={this.getIconForKind(node.kind) + this.getClassForKindModifiers(node.kindModifiers)}>{node.text}</span>
      {node.childItems ? node.childItems.
        sort((a, b) => this._nodeStartLine(a) - this._nodeStartLine(b)).//TODO should there be a different sort-order? for now: just by line-number
        map(sn => this.renderNode(sn, indent + 1)) : ''}
    </div>
    domNode.dataset.start = this._nodeStartLine(node) + '';
    domNode.dataset.end = this._nodeEndLine(node) + '';

    //set selected
    this.setSelected(domNode, selected);

    return domNode;
  }

  getIconForKind(kind: string) {
    return `icon icon-${kind}`;
  }

  getClassForKindModifiers(kindModifiers: string) {
    return kindModifiers ? (' ' + kindModifiers) : '';
  }

  isNodeChild(node: HTMLElement, childNode: HTMLElement) {
    let parent = childNode.parentNode;
    while (parent !== node && parent !== null) {
      parent = parent.parentNode;
    }
    return parent === node;
  }

  isSelected(node: NavigationTree) {
    if (this.whileRendering.lastCursorLine == null) return '';
    else {
      if (this._nodeStartLine(node) <= this.whileRendering.lastCursorLine && this._nodeEndLine(node) >= this.whileRendering.lastCursorLine) {
        return 'selected';
      }
      return '';
    }
  }

  setSelected(domNode: HTMLElement, selected: string, forceSelection?: boolean) {
    if (selected) {

      let setSelected: boolean = true;
      if (this.selectedNode) {
        //do not select, if there is a node selected "further down"
        if (!forceSelection && this.isNodeChild(domNode, this.selectedNode)) {
          setSelected = false;
        }
      }

      if (setSelected) {

        let labelSpan: Element;
        if (this.selectedNode) {
          labelSpan = this.selectedNode.firstElementChild || this.selectedNode;
          labelSpan.classList.remove(selected);
        }

        labelSpan = domNode.firstElementChild || domNode;
        labelSpan.classList.add(selected);
        this.selectedNode = domNode;
      }
    }
  }

  selectAtCursorLine() {
    this.whileRendering = {
      lastCursorLine: this.editor && this.editor.getLastCursor() ? this.editor.getLastCursor().getBufferRow() : null
    };

    let cursorLine = this.whileRendering.lastCursorLine;
    if (!cursorLine || !this.navTree) {
      return;
    }

    let selectedChild = this.findNodeAtCursorLine(this.root, cursorLine);
    if (selectedChild !== null) {
      // console.log('select at cursor-line '+cursorLine, selectedChild);
      this.setSelected(selectedChild, 'selected', true);
      this.scrollTo(selectedChild);
    }
  }

  findNodeAtCursorLine(domNode: HTMLElement, cursorLine: number): HTMLElement | null {

    if (!domNode.children) {
      return null;
    }

    for (let i = 0, size = domNode.childElementCount;i < size;++i) {
      let elem = domNode.children[i] as HTMLElement;
      let selectedChild: HTMLElement | null = null;
      if (elem.dataset) {
        let start: number = parseInt(elem.dataset.start as string, 10);
        let end: number = parseInt(elem.dataset.end as string, 10);
        if (isFinite(start) && isFinite(end)) {
          if (cursorLine >= start && cursorLine <= end) {
            selectedChild = this.findNodeAtCursorLine(elem, cursorLine);
            if (selectedChild) {
              return selectedChild;
            }
          } else if (isFinite(end) && cursorLine < end) {
            break;
          }
        }
      }

      selectedChild = this.findNodeAtCursorLine(elem, cursorLine);

      if (selectedChild) {
        return selectedChild;
      }
    }

    if (domNode.dataset) {
      let start: number = parseInt(domNode.dataset.start as string, 10);
      let end: number = parseInt(domNode.dataset.end as string, 10);
      if (isFinite(start) && isFinite(end) && cursorLine >= start && cursorLine <= end) {
        return domNode;
      }
    }

    return null;
  }

  scrollTo(domNode: HTMLElement) {
    let elem: any = domNode;
    if (typeof elem.scrollIntoViewIfNeeded === 'function') {
      elem.scrollIntoViewIfNeeded();
    } else if (typeof elem.scrollIntoView === 'function') {
      elem.scrollIntoView();
    }//TODO else: impl. scroll
  }

  gotoNode(node: NavigationTree) {
    var gotoLine = this._nodeStartLine(node);
    this.editor.setCursorBufferPosition([gotoLine, 0]);
  }
}

export interface SemanticViewOptions {}

export class SemanticView extends view.ScrollView<SemanticViewOptions> {

  public mainContent: JQuery;
  public get rootDomElement() {
    return this.mainContent[0];
  }
  private comp: SemanticViewRenderer;
  static content() {
    return this.div({class: 'atomts atomts-semantic-view native-key-bindings'}, () => {
      this.div({outlet: 'mainContent', class: 'layout vertical'});
    });
  }

  constructor(public config: SemanticViewOptions) {
    super(config);
  }

  /**
   * This function exists because the react component needs access to `panel` which needs access to `SemanticView`.
   * So we lazily create react component after panel creation
   */
  started = false
  start() {
    if (this.started) {
      this.comp.forceUpdate();
      return;
    }
    this.started = true;
    this.comp = new SemanticViewRenderer();
    this.comp.componentDidMount();
    this.comp._render(this.rootDomElement);
  }
}



export var mainView: SemanticView;
export var showSemanticView: boolean = false;
var panel: AtomCore.Panel;
export function attach(): {dispose(): void, semanticView: SemanticView} {

  // Only attach once
  if (mainView) {
    return {
      dispose() {
        console.log("TODO: Detach the semantic view: ", panel)
      },
      semanticView: mainView
    };
  }

  mainView = new SemanticView({});
  panel = atom.workspace.addRightPanel({
    item: mainView,
    priority: 1000,
    visible: atomUtils.isActiveEditorOnDiskAndTs() && showSemanticView
  });

  if (panel.isVisible()) {
    mainView.start();
  }

  return {
    dispose() {
      console.log("TODO: Detach the semantic view: ", panel)
    },
    semanticView: mainView
  }
}

export function toggle() {
  if (panel.isVisible()) {
    showSemanticView = (false);
    panel.hide();
  } else {
    showSemanticView = (true);
    panel.show();
    mainView.start();
  }
}
