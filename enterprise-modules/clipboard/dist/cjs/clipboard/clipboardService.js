"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@ag-grid-community/core");
var ClipboardService = /** @class */ (function (_super) {
    __extends(ClipboardService, _super);
    function ClipboardService() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ClipboardService.prototype.registerGridCore = function (gridCore) {
        this.gridCore = gridCore;
    };
    ClipboardService.prototype.init = function () {
        this.logger = this.loggerFactory.create('ClipboardService');
        if (this.rowModel.getType() === core_1.Constants.ROW_MODEL_TYPE_CLIENT_SIDE) {
            this.clientSideRowModel = this.rowModel;
        }
    };
    ClipboardService.prototype.pasteFromClipboard = function () {
        var _this = this;
        this.logger.log('pasteFromClipboard');
        // Method 1 - native clipboard API, available in modern chrome browsers
        var allowNavigator = !this.gridOptionsWrapper.isSuppressClipboardApi();
        if (allowNavigator && navigator.clipboard) {
            navigator.clipboard.readText()
                .then(this.processClipboardData.bind(this))
                .catch(function () {
                // no processing, if fails, do nothing, paste doesn't happen
            });
            return;
        }
        // Method 2 - if modern API fails, the old school hack
        this.executeOnTempElement(function (textArea) { return textArea.focus(); }, function (element) {
            var data = element.value;
            _this.processClipboardData(data);
        });
    };
    ClipboardService.prototype.processClipboardData = function (data) {
        var _this = this;
        if (core_1._.missingOrEmpty(data)) {
            return;
        }
        var parsedData = core_1._.stringToArray(data, this.gridOptionsWrapper.getClipboardDeliminator());
        var userFunc = this.gridOptionsWrapper.getProcessDataFromClipboardFunc();
        if (userFunc) {
            parsedData = userFunc({ data: parsedData });
        }
        if (core_1._.missingOrEmpty(parsedData)) {
            return;
        }
        if (this.gridOptionsWrapper.isSuppressLastEmptyLineOnPaste()) {
            this.removeLastLineIfBlank(parsedData);
        }
        var pasteOperation = function (cellsToFlash, updatedRowNodes, focusedCell, changedPath) {
            var rangeActive = _this.rangeController && _this.rangeController.isMoreThanOneCell();
            var pasteIntoRange = rangeActive && !_this.hasOnlyOneValueToPaste(parsedData);
            if (pasteIntoRange) {
                _this.pasteIntoActiveRange(parsedData, cellsToFlash, updatedRowNodes, changedPath);
            }
            else {
                _this.pasteStartingFromFocusedCell(parsedData, cellsToFlash, updatedRowNodes, focusedCell, changedPath);
            }
        };
        this.doPasteOperation(pasteOperation);
    };
    // common code to paste operations, e.g. paste to cell, paste to range, and copy range down
    ClipboardService.prototype.doPasteOperation = function (pasteOperationFunc) {
        var api = this.gridOptionsWrapper.getApi();
        var columnApi = this.gridOptionsWrapper.getColumnApi();
        var source = 'clipboard';
        this.eventService.dispatchEvent({
            type: core_1.Events.EVENT_PASTE_START,
            api: api,
            columnApi: columnApi,
            source: source
        });
        var changedPath;
        if (this.clientSideRowModel) {
            var onlyChangedColumns = this.gridOptionsWrapper.isAggregateOnlyChangedColumns();
            changedPath = new core_1.ChangedPath(onlyChangedColumns, this.clientSideRowModel.getRootNode());
        }
        var cellsToFlash = {};
        var updatedRowNodes = [];
        var doc = this.gridOptionsWrapper.getDocument();
        var focusedElementBefore = doc.activeElement;
        var focusedCell = this.focusController.getFocusedCell();
        pasteOperationFunc(cellsToFlash, updatedRowNodes, focusedCell, changedPath);
        if (changedPath) {
            this.clientSideRowModel.doAggregate(changedPath);
        }
        this.rowRenderer.refreshCells();
        this.dispatchFlashCells(cellsToFlash);
        this.fireRowChanged(updatedRowNodes);
        var focusedElementAfter = doc.activeElement;
        // if using the clipboard hack with a temp element, then the focus has been lost,
        // so need to put it back. otherwise paste operation loosed focus on cell and keyboard
        // navigation stops.
        if (focusedCell && focusedElementBefore != focusedElementAfter) {
            this.focusController.setFocusedCell(focusedCell.rowIndex, focusedCell.column, focusedCell.rowPinned, true);
        }
        this.eventService.dispatchEvent({
            type: core_1.Events.EVENT_PASTE_END,
            api: api,
            columnApi: columnApi,
            source: source
        });
    };
    ClipboardService.prototype.pasteIntoActiveRange = function (clipboardData, cellsToFlash, updatedRowNodes, changedPath) {
        var _this = this;
        // true if clipboard data can be evenly pasted into range, otherwise false
        var abortRepeatingPasteIntoRows = this.getRangeSize() % clipboardData.length != 0;
        var indexOffset = 0;
        var dataRowIndex = 0;
        var rowCallback = function (currentRow, rowNode, columns, index) {
            var atEndOfClipboardData = index - indexOffset >= clipboardData.length;
            if (atEndOfClipboardData) {
                if (abortRepeatingPasteIntoRows) {
                    return;
                }
                // increment offset and reset data index to repeat paste of data
                indexOffset += dataRowIndex;
                dataRowIndex = 0;
            }
            var currentRowData = clipboardData[index - indexOffset];
            // otherwise we are not the first row, so copy
            updatedRowNodes.push(rowNode);
            var processCellFromClipboardFunc = _this.gridOptionsWrapper.getProcessCellFromClipboardFunc();
            columns.forEach(function (column, idx) {
                if (!column.isCellEditable(rowNode) || column.isSuppressPaste(rowNode)) {
                    return;
                }
                // repeat data for columns we don't have data for - happens when to range is bigger than copied data range
                if (idx >= currentRowData.length) {
                    idx = idx % currentRowData.length;
                }
                var newValue = _this.processCell(rowNode, column, currentRowData[idx], core_1.Constants.EXPORT_TYPE_DRAG_COPY, processCellFromClipboardFunc);
                _this.valueService.setValue(rowNode, column, newValue, core_1.Constants.SOURCE_PASTE);
                if (changedPath) {
                    changedPath.addParentNode(rowNode.parent, [column]);
                }
                var cellId = _this.cellPositionUtils.createIdFromValues(currentRow.rowIndex, column, currentRow.rowPinned);
                cellsToFlash[cellId] = true;
            });
            dataRowIndex++;
        };
        this.iterateActiveRanges(false, rowCallback);
    };
    ClipboardService.prototype.pasteStartingFromFocusedCell = function (parsedData, cellsToFlash, updatedRowNodes, focusedCell, changedPath) {
        if (!focusedCell) {
            return;
        }
        var currentRow = { rowIndex: focusedCell.rowIndex, rowPinned: focusedCell.rowPinned };
        var columnsToPasteInto = this.columnController.getDisplayedColumnsStartingAt(focusedCell.column);
        this.pasteMultipleValues(parsedData, currentRow, updatedRowNodes, columnsToPasteInto, cellsToFlash, core_1.Constants.EXPORT_TYPE_CLIPBOARD, changedPath);
    };
    ClipboardService.prototype.hasOnlyOneValueToPaste = function (parsedData) {
        return parsedData.length === 1 && parsedData[0].length === 1;
    };
    ClipboardService.prototype.copyRangeDown = function () {
        var _this = this;
        if (!this.rangeController || this.rangeController.isEmpty()) {
            return;
        }
        var firstRowValues = [];
        var pasteOperation = function (cellsToFlash, updatedRowNodes, focusedCell, changedPath) {
            var processCellForClipboardFunc = _this.gridOptionsWrapper.getProcessCellForClipboardFunc();
            var processCellFromClipboardFunc = _this.gridOptionsWrapper.getProcessCellFromClipboardFunc();
            var rowCallback = function (currentRow, rowNode, columns) {
                // take reference of first row, this is the one we will be using to copy from
                if (!firstRowValues.length) {
                    // two reasons for looping through columns
                    columns.forEach(function (column) {
                        // get the initial values to copy down
                        var value = _this.processCell(rowNode, column, _this.valueService.getValue(column, rowNode), core_1.Constants.EXPORT_TYPE_DRAG_COPY, processCellForClipboardFunc);
                        firstRowValues.push(value);
                    });
                }
                else {
                    // otherwise we are not the first row, so copy
                    updatedRowNodes.push(rowNode);
                    columns.forEach(function (column, index) {
                        if (!column.isCellEditable(rowNode) || column.isSuppressPaste(rowNode)) {
                            return;
                        }
                        var firstRowValue = _this.processCell(rowNode, column, firstRowValues[index], core_1.Constants.EXPORT_TYPE_DRAG_COPY, processCellFromClipboardFunc);
                        _this.valueService.setValue(rowNode, column, firstRowValue, core_1.Constants.SOURCE_PASTE);
                        if (changedPath) {
                            changedPath.addParentNode(rowNode.parent, [column]);
                        }
                        var cellId = _this.cellPositionUtils.createIdFromValues(currentRow.rowIndex, column, currentRow.rowPinned);
                        cellsToFlash[cellId] = true;
                    });
                }
            };
            _this.iterateActiveRanges(true, rowCallback);
        };
        this.doPasteOperation(pasteOperation);
    };
    ClipboardService.prototype.removeLastLineIfBlank = function (parsedData) {
        // remove last row if empty, excel puts empty last row in
        var lastLine = core_1._.last(parsedData);
        var lastLineIsBlank = lastLine && lastLine.length === 1 && lastLine[0] === '';
        if (lastLineIsBlank) {
            core_1._.removeFromArray(parsedData, lastLine);
        }
    };
    ClipboardService.prototype.fireRowChanged = function (rowNodes) {
        var _this = this;
        if (!this.gridOptionsWrapper.isFullRowEdit()) {
            return;
        }
        rowNodes.forEach(function (rowNode) {
            var event = {
                type: core_1.Events.EVENT_ROW_VALUE_CHANGED,
                node: rowNode,
                data: rowNode.data,
                rowIndex: rowNode.rowIndex,
                rowPinned: rowNode.rowPinned,
                context: _this.gridOptionsWrapper.getContext(),
                api: _this.gridOptionsWrapper.getApi(),
                columnApi: _this.gridOptionsWrapper.getColumnApi()
            };
            _this.eventService.dispatchEvent(event);
        });
    };
    ClipboardService.prototype.pasteMultipleValues = function (clipboardGridData, currentRow, updatedRowNodes, columnsToPasteInto, cellsToFlash, type, changedPath) {
        var _this = this;
        var rowPointer = currentRow;
        clipboardGridData.forEach(function (clipboardRowData) {
            // if we have come to end of rows in grid, then skip
            if (!rowPointer) {
                return;
            }
            var rowNode = _this.rowPositionUtils.getRowNode(rowPointer);
            if (rowNode) {
                updatedRowNodes.push(rowNode);
                clipboardRowData.forEach(function (value, index) {
                    return _this.updateCellValue(rowNode, columnsToPasteInto[index], value, rowPointer, cellsToFlash, type, changedPath);
                });
                // move to next row down for next set of values
                rowPointer = _this.cellNavigationService.getRowBelow({ rowPinned: rowPointer.rowPinned, rowIndex: rowPointer.rowIndex });
            }
        });
        return rowPointer;
    };
    ClipboardService.prototype.updateCellValue = function (rowNode, column, value, currentRow, cellsToFlash, type, changedPath) {
        if (!rowNode ||
            !currentRow ||
            !column ||
            !column.isCellEditable(rowNode) ||
            column.isSuppressPaste(rowNode)) {
            return;
        }
        var processedValue = this.processCell(rowNode, column, value, type, this.gridOptionsWrapper.getProcessCellFromClipboardFunc());
        this.valueService.setValue(rowNode, column, processedValue, core_1.Constants.SOURCE_PASTE);
        var cellId = this.cellPositionUtils.createIdFromValues(currentRow.rowIndex, column, currentRow.rowPinned);
        cellsToFlash[cellId] = true;
        if (changedPath) {
            changedPath.addParentNode(rowNode.parent, [column]);
        }
    };
    ClipboardService.prototype.copyToClipboard = function (includeHeaders) {
        this.logger.log("copyToClipboard: includeHeaders = " + includeHeaders);
        // don't override 'includeHeaders' if it has been explicitly set to 'false'
        if (includeHeaders == null) {
            includeHeaders = this.gridOptionsWrapper.isCopyHeadersToClipboard();
        }
        var selectedRowsToCopy = !this.selectionController.isEmpty()
            && !this.gridOptionsWrapper.isSuppressCopyRowsToClipboard();
        // default is copy range if exists, otherwise rows
        if (this.rangeController && this.rangeController.isMoreThanOneCell()) {
            this.copySelectedRangeToClipboard(includeHeaders);
        }
        else if (selectedRowsToCopy) {
            // otherwise copy selected rows if they exist
            this.copySelectedRowsToClipboard(includeHeaders);
        }
        else if (this.focusController.isAnyCellFocused()) {
            // if there is a focused cell, copy this
            this.copyFocusedCellToClipboard(includeHeaders);
        }
        else {
            // lastly if no focused cell, try range again. this can happen
            // if use has cellSelection turned off (so no focused cell)
            // but has a cell clicked, so there exists a cell range
            // of exactly one cell (hence the first 'if' above didn't
            // get executed).
            this.copySelectedRangeToClipboard(includeHeaders);
        }
    };
    ClipboardService.prototype.iterateActiveRanges = function (onlyFirst, rowCallback, columnCallback) {
        var _this = this;
        if (!this.rangeController || this.rangeController.isEmpty()) {
            return;
        }
        var cellRanges = this.rangeController.getCellRanges();
        if (onlyFirst) {
            this.iterateActiveRange(cellRanges[0], rowCallback, columnCallback, true);
        }
        else {
            cellRanges.forEach(function (range, idx) { return _this.iterateActiveRange(range, rowCallback, columnCallback, idx === cellRanges.length - 1); });
        }
    };
    ClipboardService.prototype.iterateActiveRange = function (range, rowCallback, columnCallback, isLastRange) {
        if (!this.rangeController) {
            return;
        }
        var currentRow = this.rangeController.getRangeStartRow(range);
        var lastRow = this.rangeController.getRangeEndRow(range);
        if (columnCallback && range.columns) {
            columnCallback(range.columns);
        }
        var rangeIndex = 0;
        var isLastRow = false;
        // the currentRow could be missing if the user sets the active range manually, and sets a range
        // that is outside of the grid (eg. sets range rows 0 to 100, but grid has only 20 rows).
        while (!isLastRow && currentRow != null) {
            var rowNode = this.rowPositionUtils.getRowNode(currentRow);
            isLastRow = this.rowPositionUtils.sameRow(currentRow, lastRow);
            rowCallback(currentRow, rowNode, range.columns, rangeIndex++, isLastRow && isLastRange);
            currentRow = this.cellNavigationService.getRowBelow(currentRow);
        }
    };
    ClipboardService.prototype.copySelectedRangeToClipboard = function (includeHeaders) {
        var _this = this;
        if (includeHeaders === void 0) { includeHeaders = false; }
        if (!this.rangeController || this.rangeController.isEmpty()) {
            return;
        }
        var deliminator = this.gridOptionsWrapper.getClipboardDeliminator();
        var data = '';
        var cellsToFlash = {};
        // adds columns to the data
        var columnCallback = function (columns) {
            if (!includeHeaders) {
                return;
            }
            var processHeaderForClipboardFunc = _this.gridOptionsWrapper.getProcessHeaderForClipboardFunc();
            var columnNames = columns.map(function (column) {
                var name = _this.columnController.getDisplayNameForColumn(column, 'clipboard', true);
                return _this.processHeader(column, name, processHeaderForClipboardFunc) || '';
            });
            data += columnNames.join(deliminator) + '\r\n';
        };
        // adds cell values to the data
        var rowCallback = function (currentRow, rowNode, columns, _2, isLastRow) {
            var processCellForClipboardFunc = _this.gridOptionsWrapper.getProcessCellForClipboardFunc();
            columns.forEach(function (column, index) {
                var value = _this.valueService.getValue(column, rowNode);
                var processedValue = _this.processCell(rowNode, column, value, core_1.Constants.EXPORT_TYPE_CLIPBOARD, processCellForClipboardFunc);
                if (index != 0) {
                    data += deliminator;
                }
                if (core_1._.exists(processedValue)) {
                    data += processedValue;
                }
                var cellId = _this.cellPositionUtils.createIdFromValues(currentRow.rowIndex, column, currentRow.rowPinned);
                cellsToFlash[cellId] = true;
            });
            if (!isLastRow) {
                data += '\r\n';
            }
        };
        this.iterateActiveRanges(false, rowCallback, columnCallback);
        this.copyDataToClipboard(data);
        this.dispatchFlashCells(cellsToFlash);
    };
    ClipboardService.prototype.copyFocusedCellToClipboard = function (includeHeaders) {
        var _a;
        if (includeHeaders === void 0) { includeHeaders = false; }
        var focusedCell = this.focusController.getFocusedCell();
        if (focusedCell == null) {
            return;
        }
        var cellId = this.cellPositionUtils.createId(focusedCell);
        var currentRow = { rowPinned: focusedCell.rowPinned, rowIndex: focusedCell.rowIndex };
        var rowNode = this.rowPositionUtils.getRowNode(currentRow);
        var column = focusedCell.column;
        var value = this.valueService.getValue(column, rowNode);
        var processedValue = this.processCell(rowNode, column, value, core_1.Constants.EXPORT_TYPE_CLIPBOARD, this.gridOptionsWrapper.getProcessCellForClipboardFunc());
        processedValue = core_1._.missing(processedValue) ? '' : processedValue.toString();
        var data;
        if (includeHeaders) {
            var headerValue = this.columnController.getDisplayNameForColumn(column, 'clipboard', true);
            data = this.processHeader(column, headerValue, this.gridOptionsWrapper.getProcessHeaderForClipboardFunc()) + '\r\n' + processedValue;
        }
        else {
            data = processedValue;
        }
        this.copyDataToClipboard(data);
        this.dispatchFlashCells((_a = {}, _a[cellId] = true, _a));
    };
    ClipboardService.prototype.dispatchFlashCells = function (cellsToFlash) {
        var _this = this;
        window.setTimeout(function () {
            var event = {
                type: core_1.Events.EVENT_FLASH_CELLS,
                cells: cellsToFlash,
                api: _this.gridApi,
                columnApi: _this.columnApi
            };
            _this.eventService.dispatchEvent(event);
        }, 0);
    };
    ClipboardService.prototype.processCell = function (rowNode, column, value, type, func) {
        if (func) {
            var params = {
                column: column,
                node: rowNode,
                value: value,
                api: this.gridOptionsWrapper.getApi(),
                columnApi: this.gridOptionsWrapper.getColumnApi(),
                context: this.gridOptionsWrapper.getContext(),
                type: type,
            };
            return func(params);
        }
        return value;
    };
    ClipboardService.prototype.processHeader = function (column, value, func) {
        if (func) {
            var params = {
                column: column,
                api: this.gridOptionsWrapper.getApi(),
                columnApi: this.gridOptionsWrapper.getColumnApi(),
                context: this.gridOptionsWrapper.getContext()
            };
            return func(params);
        }
        return value;
    };
    ClipboardService.prototype.copySelectedRowsToClipboard = function (includeHeaders, columnKeys) {
        if (includeHeaders === void 0) { includeHeaders = false; }
        var params = {
            columnKeys: columnKeys,
            skipHeader: !includeHeaders,
            skipFooters: true,
            suppressQuotes: true,
            columnSeparator: this.gridOptionsWrapper.getClipboardDeliminator(),
            onlySelected: true,
            processCellCallback: this.gridOptionsWrapper.getProcessCellForClipboardFunc(),
            processHeaderCallback: this.gridOptionsWrapper.getProcessHeaderForClipboardFunc()
        };
        var data = this.csvCreator.getDataAsCsv(params);
        this.copyDataToClipboard(data);
    };
    ClipboardService.prototype.copyDataToClipboard = function (data) {
        var _this = this;
        var userProvidedFunc = this.gridOptionsWrapper.getSendToClipboardFunc();
        // method 1 - user provided func
        if (userProvidedFunc) {
            userProvidedFunc({ data: data });
            return;
        }
        // method 2 - native clipboard API, available in modern chrome browsers
        var allowNavigator = !this.gridOptionsWrapper.isSuppressClipboardApi();
        if (allowNavigator && navigator.clipboard) {
            navigator.clipboard.writeText(data).catch(function () {
                // no processing, if fails, do nothing, copy doesn't happen
            });
            return;
        }
        // method 3 - if all else fails, the old school hack
        this.executeOnTempElement(function (element) {
            var focusedElementBefore = _this.gridOptionsWrapper.getDocument().activeElement;
            element.value = data || ' '; // has to be non-empty value or execCommand will not do anything
            element.select();
            element.focus();
            var result = document.execCommand('copy');
            if (!result) {
                console.warn('ag-grid: Browser did not allow document.execCommand(\'copy\'). Ensure ' +
                    'api.copySelectedRowsToClipboard() is invoked via a user event, i.e. button click, otherwise ' +
                    'the browser will prevent it for security reasons.');
            }
            if (focusedElementBefore != null && focusedElementBefore.focus != null) {
                focusedElementBefore.focus();
            }
        });
    };
    ClipboardService.prototype.executeOnTempElement = function (callbackNow, callbackAfter) {
        var eTempInput = document.createElement('textarea');
        eTempInput.style.width = '1px';
        eTempInput.style.height = '1px';
        eTempInput.style.top = '0px';
        eTempInput.style.left = '0px';
        eTempInput.style.position = 'absolute';
        eTempInput.style.opacity = '0.0';
        var guiRoot = this.gridCore.getRootGui();
        guiRoot.appendChild(eTempInput);
        try {
            callbackNow(eTempInput);
        }
        catch (err) {
            console.warn('ag-grid: Browser does not support document.execCommand(\'copy\') for clipboard operations');
        }
        //It needs 100 otherwise OS X seemed to not always be able to paste... Go figure...
        if (callbackAfter) {
            window.setTimeout(function () {
                callbackAfter(eTempInput);
                guiRoot.removeChild(eTempInput);
            }, 100);
        }
        else {
            guiRoot.removeChild(eTempInput);
        }
    };
    ClipboardService.prototype.getRangeSize = function () {
        var ranges = this.rangeController.getCellRanges();
        var startRangeIndex = 0;
        var endRangeIndex = 0;
        if (ranges.length > 0) {
            startRangeIndex = this.rangeController.getRangeStartRow(ranges[0]).rowIndex;
            endRangeIndex = this.rangeController.getRangeEndRow(ranges[0]).rowIndex;
        }
        return startRangeIndex - endRangeIndex + 1;
    };
    __decorate([
        core_1.Autowired('csvCreator')
    ], ClipboardService.prototype, "csvCreator", void 0);
    __decorate([
        core_1.Autowired('loggerFactory')
    ], ClipboardService.prototype, "loggerFactory", void 0);
    __decorate([
        core_1.Autowired('selectionController')
    ], ClipboardService.prototype, "selectionController", void 0);
    __decorate([
        core_1.Optional('rangeController')
    ], ClipboardService.prototype, "rangeController", void 0);
    __decorate([
        core_1.Autowired('rowModel')
    ], ClipboardService.prototype, "rowModel", void 0);
    __decorate([
        core_1.Autowired('valueService')
    ], ClipboardService.prototype, "valueService", void 0);
    __decorate([
        core_1.Autowired('focusController')
    ], ClipboardService.prototype, "focusController", void 0);
    __decorate([
        core_1.Autowired('rowRenderer')
    ], ClipboardService.prototype, "rowRenderer", void 0);
    __decorate([
        core_1.Autowired('columnController')
    ], ClipboardService.prototype, "columnController", void 0);
    __decorate([
        core_1.Autowired('cellNavigationService')
    ], ClipboardService.prototype, "cellNavigationService", void 0);
    __decorate([
        core_1.Autowired('columnApi')
    ], ClipboardService.prototype, "columnApi", void 0);
    __decorate([
        core_1.Autowired('gridApi')
    ], ClipboardService.prototype, "gridApi", void 0);
    __decorate([
        core_1.Autowired('cellPositionUtils')
    ], ClipboardService.prototype, "cellPositionUtils", void 0);
    __decorate([
        core_1.Autowired('rowPositionUtils')
    ], ClipboardService.prototype, "rowPositionUtils", void 0);
    __decorate([
        core_1.PostConstruct
    ], ClipboardService.prototype, "init", null);
    ClipboardService = __decorate([
        core_1.Bean('clipboardService')
    ], ClipboardService);
    return ClipboardService;
}(core_1.BeanStub));
exports.ClipboardService = ClipboardService;
//# sourceMappingURL=clipboardService.js.map