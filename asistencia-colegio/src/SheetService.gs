/**
 * SheetService.gs - Servicios de lectura de hojas de cálculo (100% No Destructivo)
 */

/**
 * Obtiene la referencia de una hoja de cálculo por su nombre sin modificar la estructura.
 * @param {string} sheetName Nombre de la pestaña.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} Referencia a la hoja o null si no existe.
 */
function getSheetByName_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(sheetName);
}

/**
 * Lee y retorna la primera fila (encabezados) de una hoja dada.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Objeto de la hoja.
 * @returns {Array<string>} Arreglo con los nombres de encabezados normalizados (en minúsculas y sin espacios extra).
 */
function getSheetHeaders_(sheet) {
  if (!sheet) return [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  
  const headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  return headerValues.map(header => String(header).trim().toLowerCase());
}

/**
 * Lee todas las filas de datos de una pestaña y las mapea como un arreglo de objetos.
 * @param {string} sheetName Nombre de la hoja.
 * @returns {Array<Object>} Lista de objetos con propiedad `_rowIndex` y campos según encabezados.
 */
function getSheetRowsAsObjects_(sheetName) {
  const sheet = getSheetByName_(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];

  const headers = getSheetHeaders_(sheet);
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return dataRange.map((row, index) => {
    const rowObj = { _rowIndex: index + 2 };
    headers.forEach((header, colIndex) => {
      rowObj[header] = row[colIndex];
    });
    return rowObj;
  });
}

/**
 * Inserta una nueva fila en la pestaña respetando el orden exacto de los encabezados.
 * @param {string} sheetName Nombre de la hoja.
 * @param {Object} dataObj Objeto clave-valor con los datos a insertar.
 * @returns {boolean} True si se insertó con éxito.
 */
function appendRowData_(sheetName, dataObj) {
  const sheet = getSheetByName_(sheetName);
  if (!sheet) throw new Error(`La hoja "${sheetName}" no existe.`);

  const headers = getSheetHeaders_(sheet);
  const rowValues = headers.map(header => {
    const val = dataObj[header];
    return val !== undefined && val !== null ? val : '';
  });

  sheet.appendRow(rowValues);
  return true;
}

/**
 * Actualiza una fila específica por su número de fila de Google Sheets.
 * @param {string} sheetName Nombre de la pestaña.
 * @param {number} rowIndex Número de fila (1-indexed, base 2 para datos).
 * @param {Object} dataObj Objeto clave-valor con los datos actualizados.
 */
function updateRowData_(sheetName, rowIndex, dataObj) {
  const sheet = getSheetByName_(sheetName);
  if (!sheet) throw new Error(`La hoja "${sheetName}" no existe.`);

  const headers = getSheetHeaders_(sheet);
  const lastCol = headers.length;
  if (lastCol === 0) return;

  const currentRow = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  const updatedRow = headers.map((header, colIndex) => {
    if (dataObj.hasOwnProperty(header)) {
      return dataObj[header];
    }
    return currentRow[colIndex];
  });

  sheet.getRange(rowIndex, 1, 1, lastCol).setValues([updatedRow]);
}

/**
 * Inserta varias filas con UNA sola escritura, respetando el orden de los encabezados.
 * Debe llamarse con el bloqueo del script tomado (la fila inicial se calcula con getLastRow).
 * @param {string} sheetName Nombre de la hoja.
 * @param {Array<Object>} dataObjs Objetos clave-valor (una fila por objeto).
 * @returns {number} Número de la primera fila escrita (0 si no había filas que escribir).
 */
function appendRowsData_(sheetName, dataObjs) {
  if (!dataObjs || dataObjs.length === 0) return 0;
  const sheet = getSheetByName_(sheetName);
  if (!sheet) throw new Error(`La hoja "${sheetName}" no existe.`);

  const headers = getSheetHeaders_(sheet);
  if (headers.length === 0) throw new Error(`La hoja "${sheetName}" no tiene encabezados.`);

  const values = dataObjs.map(obj => headers.map(header => {
    const val = obj[header];
    return val !== undefined && val !== null ? val : '';
  }));

  const startRow = sheet.getLastRow() + 1;
  const endRow = startRow + values.length - 1;
  if (endRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), endRow - sheet.getMaxRows());
  }
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  return startRow;
}

/**
 * Elimina filas consecutivas (se usa solo para deshacer un lote escrito por appendRowsData_).
 * @param {string} sheetName
 * @param {number} startRow Primera fila a borrar.
 * @param {number} count Cantidad de filas.
 */
function deleteRows_(sheetName, startRow, count) {
  const sheet = getSheetByName_(sheetName);
  if (!sheet || !startRow || count < 1) return;
  sheet.deleteRows(startRow, count);
}


