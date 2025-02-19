/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { BaseCellRenderTemplate, CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, EXPAND_CELL_CONTENT_COMMAND_ID, getNotebookEditorFromEditorPane, IActiveNotebookEditor, ICellViewModel, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_INPUT_COLLAPSED, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_OUTPUT_COLLAPSED, NOTEBOOK_CELL_RUN_STATE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellEditType, CellKind, ICellEditOperation, ICellRange, INotebookDocumentFilter, isDocumentExcludePattern, NotebookCellMetadata, NotebookCellRunState, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, SelectionStateType, TransientMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';

// Notebook Commands
const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const NOTEBOOK_FOCUS_TOP = 'notebook.focusTop';
const NOTEBOOK_FOCUS_BOTTOM = 'notebook.focusBottom';
const NOTEBOOK_FOCUS_PREVIOUS_EDITOR = 'notebook.focusPreviousEditor';
const NOTEBOOK_FOCUS_NEXT_EDITOR = 'notebook.focusNextEditor';
const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = 'notebook.clearAllCellsOutputs';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';

// Cell Commands
const INSERT_CODE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertCodeCellAbove';
const INSERT_CODE_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertCodeCellBelow';
const INSERT_CODE_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertCodeCellAtTop';
const INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertMarkdownCellAbove';
const INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertMarkdownCellBelow';
const INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertMarkdownCellAtTop';
const CHANGE_CELL_TO_CODE_COMMAND_ID = 'notebook.cell.changeToCode';
const CHANGE_CELL_TO_MARKDOWN_COMMAND_ID = 'notebook.cell.changeToMarkdown';

const EDIT_CELL_COMMAND_ID = 'notebook.cell.edit';
const QUIT_EDIT_CELL_COMMAND_ID = 'notebook.cell.quitEdit';
const DELETE_CELL_COMMAND_ID = 'notebook.cell.delete';

const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const CLEAR_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.clearOutputs';
const CHANGE_CELL_LANGUAGE = 'notebook.cell.changeLanguage';
const CENTER_ACTIVE_CELL = 'notebook.centerActiveCell';

const FOCUS_IN_OUTPUT_COMMAND_ID = 'notebook.cell.focusInOutput';
const FOCUS_OUT_OUTPUT_COMMAND_ID = 'notebook.cell.focusOutOutput';

const COLLAPSE_CELL_INPUT_COMMAND_ID = 'notebook.cell.collapseCellContent';
const COLLAPSE_CELL_OUTPUT_COMMAND_ID = 'notebook.cell.collapseCellOutput';
const EXPAND_CELL_OUTPUT_COMMAND_ID = 'notebook.cell.expandCellOutput';

export const NOTEBOOK_ACTIONS_CATEGORY = { value: localize('notebookActions.category', "Notebook"), original: 'Notebook' };

export const CELL_TITLE_CELL_GROUP_ID = 'inline/cell';
export const CELL_TITLE_OUTPUT_GROUP_ID = 'inline/output';

export const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc

export const enum CellToolbarOrder {
	EditCell,
	SplitCell,
	SaveCell,
	ClearCellOutput
}

export const enum CellOverflowToolbarGroups {
	Copy = '1_copy',
	Insert = '2_insert',
	Edit = '3_edit',
	Collapse = '4_collapse',
}

export interface INotebookActionContext {
	readonly cellTemplate?: BaseCellRenderTemplate;
	readonly cell?: ICellViewModel;
	readonly notebookEditor: IActiveNotebookEditor;
	readonly ui?: boolean;
}

export interface INotebookCellActionContext extends INotebookActionContext {
	cell: ICellViewModel;
}

function getContextFromActiveEditor(editorService: IEditorService) {
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	if (!editor) {
		return;
	}

	if (!editor.hasModel()) {
		return;
	}

	const activeCell = editor.getActiveCell();
	return {
		cell: activeCell,
		notebookEditor: editor
	};
}

function getWidgetFromUri(accessor: ServicesAccessor, uri: URI) {
	const editorService = accessor.get(IEditorService);
	const notebookEditorService = accessor.get(INotebookEditorService);
	const editorId = editorService.getEditors(EditorsOrder.SEQUENTIAL).find(editorId => editorId.editor instanceof NotebookEditorInput && editorId.editor.resource?.toString() === uri.toString());
	if (!editorId) {
		return undefined;
	}

	const notebookEditorInput = editorId.editor as NotebookEditorInput;
	if (!notebookEditorInput.resource) {
		return undefined;
	}

	const widget = notebookEditorService.listNotebookEditors().find(widget => widget.textModel?.viewType === notebookEditorInput.viewType && widget.textModel?.uri.toString() === notebookEditorInput.resource.toString());

	if (widget && widget.hasModel()) {
		return widget;
	}

	return undefined;
}

function getContextFromUri(accessor: ServicesAccessor, context?: any) {
	const uri = URI.revive(context);

	if (uri) {
		const widget = getWidgetFromUri(accessor, uri);

		if (widget) {
			return {
				notebookEditor: widget,
			};
		}
	}

	return undefined;
}

export abstract class NotebookAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: NOTEBOOK_IS_ACTIVE_EDITOR
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.category = NOTEBOOK_ACTIONS_CATEGORY;

		super(desc);
	}

	async run(accessor: ServicesAccessor, context?: any): Promise<void> {
		const isFromUI = !!context;
		const from = isFromUI ? (this.isNotebookActionContext(context) ? 'notebookToolbar' : 'editorToolbar') : '';
		if (!this.isNotebookActionContext(context)) {
			context = this.getEditorContextFromArgsOrActive(accessor, context);
			if (!context) {
				return;
			}
		}

		const telemetryService = accessor.get(ITelemetryService);
		telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });

		this.runWithContext(accessor, context);
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void>;

	private isNotebookActionContext(context?: unknown): context is INotebookActionContext {
		return !!context && !!(context as INotebookActionContext).notebookEditor;
	}

	protected getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: any): INotebookActionContext | undefined {
		return getContextFromActiveEditor(accessor.get(IEditorService));
	}
}

export abstract class NotebookCellAction<T = INotebookCellActionContext> extends NotebookAction {
	protected isCellActionContext(context?: unknown): context is INotebookCellActionContext {
		return !!context && !!(context as INotebookCellActionContext).notebookEditor && !!(context as INotebookCellActionContext).cell;
	}

	protected getCellContextFromArgs(accessor: ServicesAccessor, context?: T, ...additionalArgs: any[]): INotebookCellActionContext | undefined {
		return undefined;
	}

	async run(accessor: ServicesAccessor, context?: INotebookCellActionContext, ...additionalArgs: any[]): Promise<void> {
		if (this.isCellActionContext(context)) {
			const telemetryService = accessor.get(ITelemetryService);
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: 'cellToolbar' });

			return this.runWithContext(accessor, context);
		}

		const contextFromArgs = this.getCellContextFromArgs(accessor, context, ...additionalArgs);

		if (contextFromArgs) {
			return this.runWithContext(accessor, contextFromArgs);
		}

		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
		if (this.isCellActionContext(activeEditorContext)) {
			return this.runWithContext(accessor, activeEditorContext);
		}
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void>;
}

const executeCellCondition = ContextKeyExpr.or(
	ContextKeyExpr.and(
		ContextKeyExpr.notEquals(NOTEBOOK_CELL_RUN_STATE.key, NotebookCellRunState[NotebookCellRunState.Running]),
		ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0)),
	NOTEBOOK_CELL_TYPE.isEqualTo('markdown'));

const executeNotebookCondition = ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0);

registerAction2(class ExecuteCell extends NotebookCellAction<ICellRange> {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			precondition: executeCellCondition,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			menu: {
				id: MenuId.NotebookCellExecute,
				when: executeCellCondition,
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.execute', "Execute Cell"),
				args: [
					{
						name: 'range',
						description: 'The cell range',
						schema: {
							'type': 'object',
							'required': ['start', 'end'],
							'properties': {
								'start': {
									'type': 'number'
								},
								'end': {
									'type': 'number'
								}
							}
						}
					},
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
			icon: icons.executeIcon
		});
	}

	getCellContextFromArgs(accessor: ServicesAccessor, context?: ICellRange, ...additionalArgs: any[]): INotebookCellActionContext | undefined {
		if (!context) {
			return;
		}

		if (typeof context.start !== 'number' || typeof context.end !== 'number' || context.start >= context.end) {
			throw new Error(`The first argument '${context}' is not a valid CellRange`);
		}

		if (additionalArgs.length && additionalArgs[0]) {
			const uri = URI.revive(additionalArgs[0]);

			if (!uri) {
				throw new Error(`The second argument '${uri}' is not a valid Uri`);
			}

			const widget = getWidgetFromUri(accessor, uri);
			if (widget) {
				const cells = widget.viewModel.viewCells;

				return {
					notebookEditor: widget,
					cell: cells[context.start]
				};
			} else {
				throw new Error(`There is no editor opened for resource ${uri}`);
			}
		}

		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);

		if (!activeEditorContext || !activeEditorContext.notebookEditor.viewModel || context.start >= activeEditorContext.notebookEditor.viewModel.viewCells.length) {
			return;
		}

		const cells = activeEditorContext.notebookEditor.viewModel.viewCells;

		// TODO@rebornix, support multiple cells
		return {
			notebookEditor: activeEditorContext.notebookEditor,
			cell: cells[context.start]
		};
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return runCell(accessor, context);
	}
});

registerAction2(class CancelExecuteCell extends NotebookCellAction<ICellRange> {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			precondition: ContextKeyExpr.equals(NOTEBOOK_CELL_RUN_STATE.key, NotebookCellRunState[NotebookCellRunState.Running]),
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			icon: icons.stopIcon,
			menu: {
				id: MenuId.NotebookCellExecute,
				when: ContextKeyExpr.equals(NOTEBOOK_CELL_RUN_STATE.key, NotebookCellRunState[NotebookCellRunState.Running]),
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.cancel', "Stop Cell Execution"),
				args: [
					{
						name: 'range',
						description: 'The cell range',
						schema: {
							'type': 'object',
							'required': ['start', 'end'],
							'properties': {
								'start': {
									'type': 'number'
								},
								'end': {
									'type': 'number'
								}
							}
						}
					},
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
		});
	}

	getCellContextFromArgs(accessor: ServicesAccessor, context?: ICellRange, ...additionalArgs: any[]): INotebookCellActionContext | undefined {
		if (!context || typeof context.start !== 'number' || typeof context.end !== 'number' || context.start >= context.end) {
			return;
		}

		if (additionalArgs.length && additionalArgs[0]) {
			const uri = URI.revive(additionalArgs[0]);

			if (uri) {
				const widget = getWidgetFromUri(accessor, uri);
				if (widget) {
					const cells = widget.viewModel.viewCells;

					return {
						notebookEditor: widget,
						cell: cells[context.start]
					};
				}
			}
		}

		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);

		if (!activeEditorContext || !activeEditorContext.notebookEditor.viewModel || context.start >= activeEditorContext.notebookEditor.viewModel.viewCells.length) {
			return;
		}

		const cells = activeEditorContext.notebookEditor.viewModel.viewCells;

		// TODO@rebornix, support multiple cells
		return {
			notebookEditor: activeEditorContext.notebookEditor,
			cell: cells[context.start]
		};
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookCellExecution(context.cell);
	}
});

export class DeleteCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				icon: icons.deleteCellIcon,
				precondition: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_SELECT_BELOW,
			precondition: executeCellCondition,
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const idx = context.notebookEditor.viewModel.getCellIndex(context.cell);
		if (typeof idx !== 'number') {
			return;
		}

		const executionP = runCell(accessor, context);

		// Try to select below, fall back on inserting
		const nextCell = context.notebookEditor.viewModel.viewCells[idx + 1];
		if (nextCell) {
			context.notebookEditor.focusNotebookCell(nextCell, 'container');
		} else {
			const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
			if (newCell) {
				context.notebookEditor.focusNotebookCell(newCell, 'editor');
			}
		}

		return executionP;
	}
});

registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_INSERT_BELOW,
			precondition: executeCellCondition,
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? 'editor' : 'container';

		const executionP = runCell(accessor, context);
		const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
		}

		return executionP;
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: RENDER_ALL_MARKDOWN_CELLS,
			title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Execute Notebook"),
			description: {
				description: localize('notebookActions.executeNotebook', "Execute Notebook"),
				args: [
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
		});
	}

	getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);

		const editorService = accessor.get(IEditorService);
		const editor = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(
			editor => editor.editor instanceof NotebookEditorInput && editor.editor.viewType === context.notebookEditor.viewModel.viewType && editor.editor.resource.toString() === context.notebookEditor.viewModel.uri.toString());
		const editorGroupService = accessor.get(IEditorGroupsService);

		if (editor) {
			const group = editorGroupService.getGroup(editor.groupId);
			group?.pinEditor(editor.editor);
		}

		return context.notebookEditor.executeNotebook();
	}
});

function renderAllMarkdownCells(context: INotebookActionContext): void {
	context.notebookEditor.viewModel.viewCells.forEach(cell => {
		if (cell.cellKind === CellKind.Markdown) {
			cell.editState = CellEditState.Preview;
		}
	});
}

registerAction2(class CancelNotebook extends NotebookAction {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.cancelNotebook', "Cancel Notebook Execution"),
			description: {
				description: localize('notebookActions.cancelNotebook', "Cancel Notebook Execution"),
				args: [
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
		});
	}

	getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookExecution();
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
	submenu: MenuId.NotebookCellInsert,
	title: localize('notebookMenu.insertCell', "Insert Cell"),
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	submenu: MenuId.NotebookCellTitle,
	title: localize('notebookMenu.cellTitle', "Notebook Cell"),
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_FOCUSED
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: EXECUTE_NOTEBOOK_COMMAND_ID,
		title: localize('notebookActions.menu.executeNotebook', "Execute Notebook (Run all cells)"),
		icon: icons.executeAllIcon,
	},
	order: -1,
	group: 'navigation',
	when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK.toNegated(), executeNotebookCondition)
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: CANCEL_NOTEBOOK_COMMAND_ID,
		title: localize('notebookActions.menu.cancelNotebook', "Stop Notebook Execution"),
		icon: icons.stopIcon,
	},
	order: -1,
	group: 'navigation',
	when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK)
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: CHANGE_CELL_TO_CODE_COMMAND_ID,
			title: localize('notebookActions.changeCellToCode', "Change Cell to Code"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_Y,
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo('markdown')),
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo('markdown')),
				group: CellOverflowToolbarGroups.Edit,
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await changeCellToKind(CellKind.Code, context);
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: CHANGE_CELL_TO_MARKDOWN_COMMAND_ID,
			title: localize('notebookActions.changeCellToMarkdown', "Change Cell to Markdown"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyCode.KEY_M,
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo('code')),
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo('code')),
				group: CellOverflowToolbarGroups.Edit,
			}
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		await changeCellToKind(CellKind.Markdown, context);
	}
});

async function runCell(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
	if (context.cell.metadata?.runState === NotebookCellRunState.Running) {
		return;
	}

	const editorGroupService = accessor.get(IEditorGroupsService);
	const group = editorGroupService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	return context.notebookEditor.executeNotebookCell(context.cell);
}

export async function changeCellToKind(kind: CellKind, context: INotebookCellActionContext, language?: string): Promise<ICellViewModel | null> {
	const { cell, notebookEditor } = context;

	if (cell.cellKind === kind) {
		return null;
	}

	if (!notebookEditor.viewModel) {
		return null;
	}

	const text = cell.getText();
	const idx = notebookEditor.viewModel.getCellIndex(cell);
	notebookEditor.viewModel.notebookDocument.applyEdits([
		{
			editType: CellEditType.Replace,
			index: idx,
			count: 1,
			cells: [{
				cellKind: kind,
				source: text,
				language: language!,
				outputs: cell.model.outputs,
				metadata: cell.metadata,
			}]
		}
	], true, undefined, () => undefined, undefined, true);
	const newCell = notebookEditor.viewModel.viewCells[idx];

	if (!newCell) {
		return null;
	}

	notebookEditor.focusNotebookCell(newCell, cell.editState === CellEditState.Editing ? 'editor' : 'container');

	return newCell;
}

abstract class InsertCellCommand extends NotebookAction {
	constructor(
		desc: Readonly<IAction2Options>,
		private kind: CellKind,
		private direction: 'above' | 'below'
	) {
		super(desc);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const newCell = context.notebookEditor.insertNotebookCell(context.cell, this.kind, this.direction, undefined, true);
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
}

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAbove', "Insert Code Cell Above"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 0
				}
			},
			CellKind.Code,
			'above');
	}
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 1
				}
			},
			CellKind.Code,
			'below');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
				title: localize('notebookActions.insertCodeCellAtTop', "Add Code Cell At Top"),
				f1: false
			});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const context = this.getEditorContextFromArgsOrActive(accessor);
		if (context) {
			this.runWithContext(accessor, context);
		}
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const newCell = context.notebookEditor.insertNotebookCell(undefined, CellKind.Code, 'above', undefined, true);
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAtTop', "Add Markdown Cell At Top"),
				f1: false
			});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const context = this.getEditorContextFromArgsOrActive(accessor);
		if (context) {
			this.runWithContext(accessor, context);
		}
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const newCell = context.notebookEditor.insertNotebookCell(undefined, CellKind.Markdown, 'above', undefined, true);
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, 'editor');
		}
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
		title: localize('notebookActions.menu.insertCode', "$(add) Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
	command: {
		id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
		title: localize('notebookActions.menu.insertCode', "$(add) Code"),
		tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
	},
	order: 0,
	group: 'inline',
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellAbove', "Insert Markdown Cell Above"),
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 2
				}
			},
			CellKind.Markdown,
			'above');
	}
});

registerAction2(class extends InsertCellCommand {
	constructor() {
		super(
			{
				id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
				title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below"),
				menu: {
					id: MenuId.NotebookCellInsert,
					order: 3
				}
			},
			CellKind.Markdown,
			'below');
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
	command: {
		id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
		title: localize('notebookActions.menu.insertMarkdown', "$(add) Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: 1,
	group: 'inline',
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
	command: {
		id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
		title: localize('notebookActions.menu.insertMarkdown', "$(add) Markdown"),
		tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
	},
	order: 1,
	group: 'inline',
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.editCell', "Edit Cell"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markdown'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(),
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.EditCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.editIcon,
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		context.notebookEditor.focusNotebookCell(context.cell, 'editor');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: QUIT_EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.quitEdit', "Stop Editing Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markdown'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.SaveCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.stopEditIcon,
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						InputFocusedContext,
						EditorContextKeys.hoverVisible.toNegated(),
						EditorContextKeys.hasNonEmptySelection.toNegated(),
						EditorContextKeys.hasMultipleSelections.toNegated()
					),
					primary: KeyCode.Escape,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		if (context.cell.cellKind === CellKind.Markdown) {
			context.cell.editState = CellEditState.Preview;
		}

		return context.notebookEditor.focusNotebookCell(context.cell, 'container');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: NOTEBOOK_EDITOR_EDITABLE
				},
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace
					},
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				},
				icon: icons.deleteCellIcon
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const viewModel = context.notebookEditor.viewModel;
		if (!viewModel || !viewModel.metadata.editable) {
			return;
		}

		const selections = viewModel.getSelections();
		const targetCellIndex = viewModel.getCellIndex(context.cell);
		const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

		if (containingSelection) {
			let finalSelections: ICellRange[] = [];
			const delta = containingSelection.end - containingSelection.start;
			for (let i = 0; i < selections.length; i++) {
				const selection = selections[i];

				if (selection.end <= targetCellIndex) {
					finalSelections.push(selection);
				} else if (selection.start > targetCellIndex) {
					finalSelections.push({ start: selection.start - delta, end: selection.end - delta });
				} else {
					finalSelections.push({ start: containingSelection.start, end: containingSelection.start + 1 });
				}
			}

			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: containingSelection.start, count: containingSelection.end - containingSelection.start, cells: []
			}], true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => {
				const newFocusCellIdx = containingSelection.start < context.notebookEditor.viewModel.notebookDocument.length ? containingSelection.start : context.notebookEditor.viewModel.notebookDocument.length - 1;

				return {
					kind: SelectionStateType.Index, focus: { start: newFocusCellIdx, end: newFocusCellIdx + 1 }, selections: finalSelections
				};
			}, undefined);
		} else {
			let finalSelections: ICellRange[] = [];
			for (let i = 0; i < selections.length; i++) {
				const selection = selections[i];

				if (selection.end <= targetCellIndex) {
					finalSelections.push(selection);
				} else if (selection.start > targetCellIndex) {
					finalSelections.push({ start: selection.start - 1, end: selection.end - 1 });
				} else {
					finalSelections.push({ start: targetCellIndex, end: targetCellIndex + 1 });
				}
			}

			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: []
			}], true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => {
				const newFocusCellIdx = targetCellIndex < context.notebookEditor.viewModel.notebookDocument.length ? targetCellIndex : context.notebookEditor.viewModel.notebookDocument.length - 1;
				return {
					kind: SelectionStateType.Index, focus: { start: newFocusCellIdx, end: newFocusCellIdx + 1 }, selections: finalSelections
				};
			}, undefined);

			// const result = await context.notebookEditor.deleteNotebookCell(context.cell);


			// if (result) {
			// 	// deletion succeeds, move focus to the next cell
			// 	const nextCellIdx = targetCellIndex < context.notebookEditor.viewModel.length ? targetCellIndex : context.notebookEditor.viewModel.length - 1;
			// 	if (nextCellIdx >= 0) {
			// 		context.notebookEditor.focusNotebookCell(context.notebookEditor.viewModel.viewCells[nextCellIdx], 'container');
			// 	}
			// }
		}
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_NEXT_EDITOR,
			title: localize('cursorMoveDown', 'Focus Next Cell Editor'),
			keybinding: [
				{
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_FOCUSED,
						ContextKeyExpr.has(InputFocusedContextKey),
						EditorContextKeys.editorTextFocus,
						NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('top'),
						NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
					primary: KeyCode.DownArrow,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				},
				{
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
					weight: KeybindingWeight.WorkbenchContrib
				}
			]
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.viewModel.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		const newCell = editor.viewModel.viewCells[idx + 1];

		if (!newCell) {
			return;
		}

		const newFocusMode = newCell.cellKind === CellKind.Markdown && newCell.editState === CellEditState.Preview ? 'container' : 'editor';
		editor.focusNotebookCell(newCell, newFocusMode);
		editor.cursorNavigationMode = true;
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_PREVIOUS_EDITOR,
			title: localize('cursorMoveUp', 'Focus Previous Cell Editor'),
			keybinding: {
				when: ContextKeyExpr.and(
					NOTEBOOK_EDITOR_FOCUSED,
					ContextKeyExpr.has(InputFocusedContextKey),
					EditorContextKeys.editorTextFocus,
					NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('bottom'),
					NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo('none')),
				primary: KeyCode.UpArrow,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;

		const idx = editor.viewModel.getCellIndex(activeCell);
		if (typeof idx !== 'number') {
			return;
		}

		if (idx < 1) {
			// we don't do loop
			return;
		}

		const newCell = editor.viewModel.viewCells[idx - 1];

		if (!newCell) {
			return;
		}

		const newFocusMode = newCell.cellKind === CellKind.Markdown && newCell.editState === CellEditState.Preview ? 'container' : 'editor';
		editor.focusNotebookCell(newCell, newFocusMode);
		editor.cursorNavigationMode = true;
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: FOCUS_IN_OUTPUT_COMMAND_ID,
			title: localize('focusOutput', 'Focus In Active Cell Output'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_CELL_HAS_OUTPUTS),
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		editor.focusNotebookCell(activeCell, 'output');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: FOCUS_OUT_OUTPUT_COMMAND_ID,
			title: localize('focusOutputOut', 'Focus Out Active Cell Output'),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.UpArrow, },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		const activeCell = context.cell;
		editor.focusNotebookCell(activeCell, 'editor');
	}
});


registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_TOP,
			title: localize('focusFirstCell', 'Focus First Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.Home,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		const firstCell = editor.viewModel.viewCells[0];
		editor.focusNotebookCell(firstCell, 'container');
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_FOCUS_BOTTOM,
			title: localize('focusLastCell', 'Focus Last Cell'),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.End,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		const firstCell = editor.viewModel.viewCells[editor.viewModel.length - 1];
		editor.focusNotebookCell(firstCell, 'container');
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
			title: localize('clearCellOutputs', 'Clear Cell Outputs'),
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), executeNotebookCondition, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
				order: CellToolbarOrder.ClearCellOutput,
				group: CELL_TITLE_OUTPUT_GROUP_ID
			},
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
				primary: KeyMod.Alt | KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		const cell = context.cell;
		const index = editor.viewModel.notebookDocument.cells.indexOf(cell.model);

		if (index < 0) {
			return;
		}

		editor.viewModel.notebookDocument.applyEdits([{ editType: CellEditType.Output, index, outputs: [] }], true, undefined, () => undefined, undefined);

		if (context.cell.metadata && context.cell.metadata?.runState !== NotebookCellRunState.Running) {
			context.notebookEditor.viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Metadata, index, metadata: {
					...context.cell.metadata,
					runState: NotebookCellRunState.Idle,
					runStartTime: undefined,
					lastRunDuration: undefined,
					statusMessage: undefined,
					executionOrder: undefined
				}
			}], true, undefined, () => undefined, undefined);
		}
	}
});

interface ILanguagePickInput extends IQuickPickItem {
	languageId: string;
	description: string;
}


interface IChangeCellContext extends INotebookCellActionContext {
	// TODO@rebornix : `cells`
	// range: ICellRange;
	language?: string;
}

export class ChangeCellLanguageAction extends NotebookCellAction<ICellRange> {
	constructor() {
		super({
			id: CHANGE_CELL_LANGUAGE,
			title: localize('changeLanguage', 'Change Cell Language'),
			description: {
				description: localize('changeLanguage', 'Change Cell Language'),
				args: [
					{
						name: 'range',
						description: 'The cell range',
						schema: {
							'type': 'object',
							'required': ['start', 'end'],
							'properties': {
								'start': {
									'type': 'number'
								},
								'end': {
									'type': 'number'
								}
							}
						}
					},
					{
						name: 'language',
						description: 'The target cell language',
						schema: {
							'type': 'string'
						}
					}
				]
			}
		});
	}

	protected getCellContextFromArgs(accessor: ServicesAccessor, context?: ICellRange, ...additionalArgs: any[]): IChangeCellContext | undefined {
		if (!context || typeof context.start !== 'number' || typeof context.end !== 'number' || context.start >= context.end) {
			return;
		}

		const language = additionalArgs.length && typeof additionalArgs[0] === 'string' ? additionalArgs[0] : undefined;
		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);

		if (!activeEditorContext || !activeEditorContext.notebookEditor.viewModel || context.start >= activeEditorContext.notebookEditor.viewModel.viewCells.length) {
			return;
		}

		const cells = activeEditorContext.notebookEditor.viewModel.viewCells;

		// TODO@rebornix, support multiple cells
		return {
			notebookEditor: activeEditorContext.notebookEditor,
			cell: cells[context.start],
			language
		};
	}


	async runWithContext(accessor: ServicesAccessor, context: IChangeCellContext): Promise<void> {
		if (context.language) {
			await this.setLanguage(context, context.language);
		} else {
			await this.showLanguagePicker(accessor, context);
		}
	}

	private async showLanguagePicker(accessor: ServicesAccessor, context: IChangeCellContext) {
		const topItems: ILanguagePickInput[] = [];
		const mainItems: ILanguagePickInput[] = [];

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const quickInputService = accessor.get(IQuickInputService);

		const providerLanguages = [
			...(context.notebookEditor.activeKernel?.supportedLanguages ?? modeService.getRegisteredModes()),
			'markdown'
		];
		providerLanguages.forEach(languageId => {
			let description: string;
			if (context.cell.cellKind === CellKind.Markdown ? (languageId === 'markdown') : (languageId === context.cell.language)) {
				description = localize('languageDescription', "({0}) - Current Language", languageId);
			} else {
				description = localize('languageDescriptionConfigured', "({0})", languageId);
			}

			const languageName = modeService.getLanguageName(languageId);
			if (!languageName) {
				// Notebook has unrecognized language
				return;
			}

			const item = <ILanguagePickInput>{
				label: languageName,
				iconClasses: getIconClasses(modelService, modeService, this.getFakeResource(languageName, modeService)),
				description,
				languageId
			};

			if (languageId === 'markdown' || languageId === context.cell.language) {
				topItems.push(item);
			} else {
				mainItems.push(item);
			}
		});

		mainItems.sort((a, b) => {
			return a.description.localeCompare(b.description);
		});

		const picks: QuickPickInput[] = [
			...topItems,
			{ type: 'separator' },
			...mainItems
		];

		const selection = await quickInputService.pick(picks, { placeHolder: localize('pickLanguageToConfigure', "Select Language Mode") }) as ILanguagePickInput | undefined;
		if (selection && selection.languageId) {
			await this.setLanguage(context, selection.languageId);
		}
	}

	private async setLanguage(context: IChangeCellContext, languageId: string) {
		if (languageId === 'markdown' && context.cell?.language !== 'markdown') {
			const newCell = await changeCellToKind(CellKind.Markdown, { cell: context.cell, notebookEditor: context.notebookEditor }, 'markdown');
			if (newCell) {
				context.notebookEditor.focusNotebookCell(newCell, 'editor');
			}
		} else if (languageId !== 'markdown' && context.cell?.cellKind === CellKind.Markdown) {
			await changeCellToKind(CellKind.Code, { cell: context.cell, notebookEditor: context.notebookEditor }, languageId);
		} else {
			const index = context.notebookEditor.viewModel.notebookDocument.cells.indexOf(context.cell.model);
			context.notebookEditor.viewModel.notebookDocument.applyEdits(
				[{ editType: CellEditType.CellLanguage, index, language: languageId }],
				true, undefined, () => undefined, undefined
			);
		}
	}

	/**
	 * Copied from editorStatus.ts
	 */
	private getFakeResource(lang: string, modeService: IModeService): URI | undefined {
		let fakeResource: URI | undefined;

		const extensions = modeService.getExtensions(lang);
		if (extensions?.length) {
			fakeResource = URI.file(extensions[0]);
		} else {
			const filenames = modeService.getFilenames(lang);
			if (filenames?.length) {
				fakeResource = URI.file(filenames[0]);
			}
		}

		return fakeResource;
	}
}
registerAction2(ChangeCellLanguageAction);

registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
			title: localize('clearAllCellsOutputs', 'Clear All Cells Outputs'),
			menu: {
				id: MenuId.NotebookToolbar,
				// when: NOTEBOOK_IS_ACTIVE_EDITOR,
				group: 'navigation',
				order: 0
			},
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.viewModel || !editor.viewModel.length) {
			return;
		}

		editor.viewModel.notebookDocument.applyEdits(
			editor.viewModel.notebookDocument.cells.map((cell, index) => ({
				editType: CellEditType.Output, index, outputs: []
			})), true, undefined, () => undefined, undefined);

		const clearExecutionMetadataEdits = editor.viewModel.notebookDocument.cells.map((cell, index) => {
			if (cell.metadata && cell.metadata?.runState !== NotebookCellRunState.Running) {
				return {
					editType: CellEditType.Metadata, index, metadata: {
						...cell.metadata,
						runState: NotebookCellRunState.Idle,
						runStartTime: undefined,
						lastRunDuration: undefined,
						statusMessage: undefined,
						executionOrder: undefined
					}
				};
			} else {
				return undefined;
			}
		}).filter(edit => !!edit) as ICellEditOperation[];
		if (clearExecutionMetadataEdits.length) {
			context.notebookEditor.viewModel.notebookDocument.applyEdits(clearExecutionMetadataEdits, true, undefined, () => undefined, undefined);
		}
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super({
			id: CENTER_ACTIVE_CELL,
			title: localize('notebookActions.centerActiveCell', "Center Active Cell"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_L,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KEY_L,
				},
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.revealInCenter(context.cell);
	}
});

abstract class ChangeNotebookCellMetadataAction extends NotebookCellAction {
	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const cell = context.cell;
		const textModel = context.notebookEditor.viewModel.notebookDocument;
		if (!textModel) {
			return;
		}

		const index = textModel.cells.indexOf(cell.model);

		if (index < 0) {
			return;
		}

		textModel.applyEdits([{ editType: CellEditType.Metadata, index, metadata: { ...context.cell.metadata, ...this.getMetadataDelta() } }], true, undefined, () => undefined, undefined);
	}

	abstract getMetadataDelta(): NotebookCellMetadata;
}

registerAction2(class extends ChangeNotebookCellMetadataAction {
	constructor() {
		super({
			id: COLLAPSE_CELL_INPUT_COMMAND_ID,
			title: localize('notebookActions.collapseCellInput', "Collapse Cell Input"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated()),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C),
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated()),
				group: CellOverflowToolbarGroups.Collapse,
			}
		});
	}

	getMetadataDelta(): NotebookCellMetadata {
		return { inputCollapsed: true };
	}
});

registerAction2(class extends ChangeNotebookCellMetadataAction {
	constructor() {
		super({
			id: EXPAND_CELL_CONTENT_COMMAND_ID,
			title: localize('notebookActions.expandCellContent', "Expand Cell Content"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_C),
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_INPUT_COLLAPSED),
				group: CellOverflowToolbarGroups.Collapse,
			}
		});
	}

	getMetadataDelta(): NotebookCellMetadata {
		return { inputCollapsed: false };
	}
});

registerAction2(class extends ChangeNotebookCellMetadataAction {
	constructor() {
		super({
			id: COLLAPSE_CELL_OUTPUT_COMMAND_ID,
			title: localize('notebookActions.collapseCellOutput', "Collapse Cell Output"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_T),
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_OUTPUT_COLLAPSED.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
				group: CellOverflowToolbarGroups.Collapse,
			}
		});
	}

	getMetadataDelta(): NotebookCellMetadata {
		return { outputCollapsed: true };
	}
});

registerAction2(class extends ChangeNotebookCellMetadataAction {
	constructor() {
		super({
			id: EXPAND_CELL_OUTPUT_COMMAND_ID,
			title: localize('notebookActions.expandCellOutput', "Expand Cell Output"),
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_T),
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.NotebookCellTitle,
				when: ContextKeyExpr.and(NOTEBOOK_CELL_OUTPUT_COLLAPSED),
				group: CellOverflowToolbarGroups.Collapse,
			}
		});
	}

	getMetadataDelta(): NotebookCellMetadata {
		return { outputCollapsed: false };
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.inspectLayout',
			title: localize('notebookActions.inspectLayout', "Inspect Notebook Layout"),
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	protected getActiveEditorContext(accessor: ServicesAccessor): INotebookActionContext | undefined {
		const editorService = accessor.get(IEditorService);

		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!editor) {
			return;
		}

		if (!editor.hasModel()) {
			return;
		}

		const activeCell = editor.getActiveCell();
		return {
			cell: activeCell,
			notebookEditor: editor
		};
	}

	run(accessor: ServicesAccessor) {
		const activeEditorContext = this.getActiveEditorContext(accessor);

		if (activeEditorContext) {
			const viewModel = activeEditorContext.notebookEditor.viewModel;
			console.log('--- notebook ---');
			console.log(viewModel.layoutInfo);
			console.log('--- cells ---');
			for (let i = 0; i < viewModel.length; i++) {
				const cell = viewModel.viewCells[i] as CellViewModel;
				console.log(`--- cell: ${cell.handle} ---`);
				console.log(cell.layoutInfo);
			}

		}
	}
});

// Revisit once we have a story for trusted workspace
CommandsRegistry.registerCommand('notebook.trust', (accessor, args) => {
	const uri = URI.revive(args as UriComponents);
	const notebookService = accessor.get<INotebookService>(INotebookService);


	const document = notebookService.listNotebookDocuments().find(document => document.uri.toString() === uri.toString());

	if (document) {
		document.applyEdits([{ editType: CellEditType.DocumentMetadata, metadata: { ...document.metadata, ...{ trusted: true } } }], true, undefined, () => undefined, undefined, false);
	}
});

CommandsRegistry.registerCommand('_resolveNotebookContentProvider', (accessor, args): {
	viewType: string;
	displayName: string;
	options: { transientOutputs: boolean; transientMetadata: TransientMetadata; };
	filenamePattern: (string | glob.IRelativePattern | { include: string | glob.IRelativePattern, exclude: string | glob.IRelativePattern; })[];
}[] => {
	const notebookService = accessor.get<INotebookService>(INotebookService);
	const contentProviders = notebookService.getContributedNotebookProviders();
	return contentProviders.map(provider => {
		const filenamePatterns = provider.selectors.map(selector => {
			if (typeof selector === 'string') {
				return selector;
			}

			if (glob.isRelativePattern(selector)) {
				return selector;
			}

			if (isDocumentExcludePattern(selector)) {
				return {
					include: selector.include,
					exclude: selector.exclude
				};
			}

			return null;
		}).filter(pattern => pattern !== null) as (string | glob.IRelativePattern | { include: string | glob.IRelativePattern, exclude: string | glob.IRelativePattern; })[];

		return {
			viewType: provider.id,
			displayName: provider.displayName,
			filenamePattern: filenamePatterns,
			options: { transientMetadata: provider.options.transientMetadata, transientOutputs: provider.options.transientOutputs }
		};
	});
});

CommandsRegistry.registerCommand('_resolveNotebookKernelProviders', async (accessor, args): Promise<{
	extensionId: string;
	description?: string;
	selector: INotebookDocumentFilter;
}[]> => {
	const notebookService = accessor.get<INotebookService>(INotebookService);
	const providers = await notebookService.getContributedNotebookKernelProviders();
	return providers.map(provider => ({
		extensionId: provider.providerExtensionId,
		description: provider.providerDescription,
		selector: provider.selector
	}));
});

CommandsRegistry.registerCommand('_resolveNotebookKernels', async (accessor, args: {
	viewType: string;
	uri: UriComponents;
}): Promise<{
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	preloads?: URI[];
}[]> => {
	const notebookService = accessor.get<INotebookService>(INotebookService);
	const uri = URI.revive(args.uri as UriComponents);
	const source = new CancellationTokenSource();
	const kernels = await notebookService.getNotebookKernels(args.viewType, uri, source.token);
	source.dispose();

	return kernels.map(provider => ({
		id: provider.friendlyId,
		label: provider.label,
		description: provider.description,
		detail: provider.detail,
		isPreferred: provider.isPreferred,
		preloads: provider.preloads?.map(preload => URI.revive(preload)) || []
	}));
});
