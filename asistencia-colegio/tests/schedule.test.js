/**
 * Pruebas de la estructura de jornadas (bloques y recesos).
 *
 * Sin dependencias: usa node:test y vm para cargar los archivos reales de src/.
 * Ejecutar desde la raíz del proyecto:   node --test tests/
 *
 * Este archivo está fuera de src/ (clasp rootDir = "src"), por lo que no se sube a Apps Script.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

/**
 * Carga archivos .gs en un contexto aislado (comparten el ámbito global, como en Apps Script).
 * @param {Object<string,function(string):string>} [patches] Reemplazos de texto por archivo (pruebas negativas).
 */
function loadContext(patches) {
  const ctx = vm.createContext({ Logger: { log() {} } });
  ['Config.gs', 'AccessService.gs', 'ScheduleService.gs'].forEach(file => {
    let code = fs.readFileSync(path.join(SRC, file), 'utf8');
    if (patches && patches[file]) code = patches[file](code);
    vm.runInContext(code, ctx, { filename: file });
  });
  return {
    ctx,
    run: expr => vm.runInContext(expr, ctx),
    // Los objetos creados dentro del contexto tienen otros prototipos: se normalizan para deepEqual.
    json: expr => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx))
  };
}

const env = loadContext();

// Fechas de referencia (octubre 2026): lunes 05 ... jueves 08, viernes 09, sábado 10, domingo 11.
const MONDAY = '2026-10-05';
const THURSDAY = '2026-10-08';
const FRIDAY = '2026-10-09';
const SATURDAY = '2026-10-10';
const SUNDAY = '2026-10-11';

const JORNADAS = ['Mañana', 'Tarde', 'Noche'];
const STARTS = { 'Mañana': '09:00', 'Tarde': '14:30', 'Noche': '19:00' };

/**
 * Horarios esperados, escritos a mano (no derivados del código bajo prueba).
 * Cada fila: [etiqueta, inicio, término, minutos]
 */
const EXPECTED = {
  MON_THU: {
    'Mañana': [
      ['Bloque 1', '09:00', '09:45', 45], ['Bloque 2', '09:45', '10:30', 45], ['Receso', '10:30', '10:40', 10],
      ['Bloque 3', '10:40', '11:25', 45], ['Bloque 4', '11:25', '12:10', 45], ['Receso', '12:10', '12:15', 5],
      ['Bloque 5', '12:15', '13:00', 45]
    ],
    'Tarde': [
      ['Bloque 1', '14:30', '15:15', 45], ['Bloque 2', '15:15', '16:00', 45], ['Receso', '16:00', '16:10', 10],
      ['Bloque 3', '16:10', '16:55', 45], ['Bloque 4', '16:55', '17:40', 45], ['Receso', '17:40', '17:45', 5],
      ['Bloque 5', '17:45', '18:30', 45]
    ],
    'Noche': [
      ['Bloque 1', '19:00', '19:45', 45], ['Bloque 2', '19:45', '20:30', 45], ['Receso', '20:30', '20:40', 10],
      ['Bloque 3', '20:40', '21:25', 45], ['Bloque 4', '21:25', '22:10', 45], ['Receso', '22:10', '22:15', 5],
      ['Bloque 5', '22:15', '23:00', 45]
    ]
  },
  FRI: {
    'Mañana': [
      ['Bloque 1', '09:00', '09:45', 45], ['Bloque 2', '09:45', '10:30', 45], ['Receso', '10:30', '10:40', 10],
      ['Bloque 3', '10:40', '11:25', 45], ['Bloque 4', '11:25', '12:10', 45], ['Receso', '12:10', '12:20', 10]
    ],
    'Tarde': [
      ['Bloque 1', '14:30', '15:15', 45], ['Bloque 2', '15:15', '16:00', 45], ['Receso', '16:00', '16:10', 10],
      ['Bloque 3', '16:10', '16:55', 45], ['Bloque 4', '16:55', '17:40', 45], ['Receso', '17:40', '17:50', 10]
    ],
    'Noche': [
      ['Bloque 1', '19:00', '19:45', 45], ['Bloque 2', '19:45', '20:30', 45], ['Receso', '20:30', '20:40', 10],
      ['Bloque 3', '20:40', '21:25', 45], ['Bloque 4', '21:25', '22:10', 45], ['Receso', '22:10', '22:20', 10]
    ]
  }
};

const toRow = s => [s.label, s.start, s.end, s.minutes];
const toMin = hhmm => Number(hhmm.split(':')[0]) * 60 + Number(hhmm.split(':')[1]);

// ── Lunes a jueves ───────────────────────────────────────────────────────────

JORNADAS.forEach(jornada => {
  test(`Lunes a jueves - ${jornada}: 5 bloques de 45 min, receso de 10 tras el bloque 2 y de 5 tras el bloque 4`, () => {
    const day = env.json(`buildDaySchedule_('${jornada}', 'MON_THU')`);
    const blocks = day.segments.filter(s => s.type === 'BLOCK');
    const breaks = day.segments.filter(s => s.type === 'BREAK');

    assert.equal(blocks.length, 5, 'cantidad de bloques');
    assert.equal(day.blocks, 5);
    assert.ok(blocks.every(b => b.minutes === 45), 'todos los bloques duran 45 min');
    assert.deepEqual(breaks.map(b => b.minutes), [10, 5], 'recesos de 10 y 5 min');

    // Orden exacto: B1 B2 R B3 B4 R B5
    assert.deepEqual(
      day.segments.map(s => s.type === 'BLOCK' ? `B${s.number}` : 'R'),
      ['B1', 'B2', 'R', 'B3', 'B4', 'R', 'B5']
    );
    // El receso de 10 min está justo después del bloque 2 y el de 5 min justo después del bloque 4
    assert.equal(day.segments[2].minutes, 10);
    assert.equal(day.segments[1].number, 2);
    assert.equal(day.segments[5].minutes, 5);
    assert.equal(day.segments[4].number, 4);
  });

  test(`Lunes a jueves - ${jornada}: horarios exactos calculados desde el inicio configurado`, () => {
    const day = env.json(`buildDaySchedule_('${jornada}', 'MON_THU')`);
    assert.equal(day.start, STARTS[jornada]);
    assert.deepEqual(day.segments.map(toRow), EXPECTED.MON_THU[jornada]);
    // La jornada termina al finalizar el bloque 5 (no hay nada después)
    const last = EXPECTED.MON_THU[jornada][6];
    assert.equal(day.classEnd, last[2]);
    assert.equal(day.end, last[2]);
    assert.equal(day.segments[day.segments.length - 1].type, 'BLOCK');
  });
});

// ── Viernes ──────────────────────────────────────────────────────────────────

JORNADAS.forEach(jornada => {
  test(`Viernes - ${jornada}: 4 bloques de 45 min, recesos de 10 tras los bloques 2 y 4, sin bloque 5`, () => {
    const day = env.json(`buildDaySchedule_('${jornada}', 'FRI')`);
    const blocks = day.segments.filter(s => s.type === 'BLOCK');
    const breaks = day.segments.filter(s => s.type === 'BREAK');

    assert.equal(blocks.length, 4, 'cantidad de bloques');
    assert.equal(day.blocks, 4);
    assert.ok(blocks.every(b => b.minutes === 45), 'todos los bloques duran 45 min');
    assert.deepEqual(breaks.map(b => b.minutes), [10, 10], 'recesos de 10 y 10 min');
    assert.ok(!day.segments.some(s => s.label === 'Bloque 5'), 'no existe el bloque 5');

    // Orden exacto: B1 B2 R B3 B4 R
    assert.deepEqual(
      day.segments.map(s => s.type === 'BLOCK' ? `B${s.number}` : 'R'),
      ['B1', 'B2', 'R', 'B3', 'B4', 'R']
    );
  });

  test(`Viernes - ${jornada}: horarios exactos y fin de clases en el bloque 4`, () => {
    const day = env.json(`buildDaySchedule_('${jornada}', 'FRI')`);
    assert.equal(day.start, STARTS[jornada]);
    assert.deepEqual(day.segments.map(toRow), EXPECTED.FRI[jornada]);
    // Fin de clases = fin del bloque 4; el receso final es lo último del detalle
    assert.equal(day.classEnd, EXPECTED.FRI[jornada][4][2]);
    assert.equal(day.end, EXPECTED.FRI[jornada][5][2]);
  });
});

// ── Propiedades generales ────────────────────────────────────────────────────

['MON_THU', 'FRI'].forEach(dayType => {
  JORNADAS.forEach(jornada => {
    test(`${dayType} - ${jornada}: elementos consecutivos, sin solapamientos ni pausas implícitas`, () => {
      const day = env.json(`buildDaySchedule_('${jornada}', '${dayType}')`);
      assert.equal(day.segments[0].start, STARTS[jornada], 'el primer elemento empieza en el inicio configurado');

      day.segments.forEach((s, i) => {
        assert.equal(toMin(s.end) - toMin(s.start), s.minutes, `${s.label}: la duración coincide con sus horas`);
        if (i > 0) assert.equal(s.start, day.segments[i - 1].end, `${s.label} empieza cuando termina el elemento anterior`);
      });

      const total = day.segments.reduce((sum, s) => sum + s.minutes, 0);
      assert.equal(toMin(day.end) - toMin(day.start), total, 'la jornada completa suma todas las duraciones');
    });

    test(`${dayType} - ${jornada}: sin bloques duplicados ni recesos consecutivos`, () => {
      const day = env.json(`buildDaySchedule_('${jornada}', '${dayType}')`);
      const labels = day.segments.filter(s => s.type === 'BLOCK').map(s => s.label);
      assert.equal(new Set(labels).size, labels.length, 'cada bloque aparece una sola vez');
      day.segments.forEach((s, i) => {
        if (i > 0) assert.ok(!(s.type === 'BREAK' && day.segments[i - 1].type === 'BREAK'), 'no hay dos recesos seguidos');
      });
    });
  });
});

test('La estructura es la misma en las tres jornadas (solo cambia el inicio)', () => {
  ['MON_THU', 'FRI'].forEach(dayType => {
    const shapes = JORNADAS.map(j =>
      env.json(`buildDaySchedule_('${j}', '${dayType}')`).segments.map(s => `${s.type}:${s.minutes}`).join(',')
    );
    assert.equal(new Set(shapes).size, 1, `${dayType}: mismas duraciones y orden en Mañana, Tarde y Noche`);
  });
});

test('Se conservan los horarios de inicio configurados', () => {
  assert.deepEqual(env.json('Object.keys(CONFIG.SCHEDULES)'), JORNADAS);
  JORNADAS.forEach(j => assert.equal(env.run(`CONFIG.SCHEDULES['${j}'].start`), STARTS[j]));
});

test('Jornada o tipo de día inexistente devuelve null', () => {
  assert.equal(env.run("buildDaySchedule_('Madrugada', 'MON_THU')"), null);
  assert.equal(env.run("buildDaySchedule_('Mañana', 'SAT')"), null);
});

// ── Tipo de día y ventana de asistencia ──────────────────────────────────────

test('getDayType_: lunes a jueves, viernes y fin de semana', () => {
  assert.equal(env.run(`getDayType_('${MONDAY}')`), 'MON_THU');
  assert.equal(env.run(`getDayType_('${THURSDAY}')`), 'MON_THU');
  assert.equal(env.run(`getDayType_('${FRIDAY}')`), 'FRI');
  assert.equal(env.run(`getDayType_('${SATURDAY}')`), null);
  assert.equal(env.run(`getDayType_('${SUNDAY}')`), null);
  assert.equal(env.run("getDayType_('2026-02-31')"), null);
});

test('getScheduleWindow_: va del inicio al fin del último bloque', () => {
  JORNADAS.forEach(j => {
    const mon = env.json(`getScheduleWindow_('${j}', '${MONDAY}')`);
    assert.deepEqual(mon, { start: STARTS[j], end: EXPECTED.MON_THU[j][6][2] }, `${j} lunes`);
    const thu = env.json(`getScheduleWindow_('${j}', '${THURSDAY}')`);
    assert.deepEqual(thu, mon, `${j} jueves igual que lunes`);
    const fri = env.json(`getScheduleWindow_('${j}', '${FRIDAY}')`);
    assert.deepEqual(fri, { start: STARTS[j], end: EXPECTED.FRI[j][4][2] }, `${j} viernes`);
    assert.equal(env.run(`getScheduleWindow_('${j}', '${SATURDAY}')`), null, `${j} sábado`);
    assert.equal(env.run(`getScheduleWindow_('${j}', '${SUNDAY}')`), null, `${j} domingo`);
  });
});

test('isTimeWithinJornada_: límites inclusivos de lunes a jueves y viernes', () => {
  const within = (j, d, t) => env.run(`isTimeWithinJornada_('${j}', '${d}', '${t}')`);
  // Mañana, lunes: 09:00 - 13:00
  assert.equal(within('Mañana', MONDAY, '08:59'), false);
  assert.equal(within('Mañana', MONDAY, '09:00'), true);
  assert.equal(within('Mañana', MONDAY, '13:00'), true);
  assert.equal(within('Mañana', MONDAY, '13:01'), false);
  // Mañana, viernes: 09:00 - 12:10 (fin del bloque 4)
  assert.equal(within('Mañana', FRIDAY, '12:10'), true);
  assert.equal(within('Mañana', FRIDAY, '12:11'), false);
  // Tarde, viernes: 14:30 - 17:40
  assert.equal(within('Tarde', FRIDAY, '17:40'), true);
  assert.equal(within('Tarde', FRIDAY, '17:41'), false);
  // Noche, lunes: 19:00 - 23:00; viernes: 19:00 - 22:10
  assert.equal(within('Noche', MONDAY, '23:00'), true);
  assert.equal(within('Noche', MONDAY, '23:01'), false);
  assert.equal(within('Noche', FRIDAY, '22:10'), true);
  assert.equal(within('Noche', FRIDAY, '22:11'), false);
  // Fin de semana y formato inválido
  assert.equal(within('Mañana', SATURDAY, '10:00'), false);
  assert.equal(within('Mañana', MONDAY, '9:30'), false);
});

// ── Validación de la configuración ───────────────────────────────────────────

test('validateScheduleConfig_: la configuración actual es válida', () => {
  assert.deepEqual(env.json('validateScheduleConfig_()'), []);
});

test('validateScheduleConfig_: detecta un receso con duración inválida', () => {
  const bad = loadContext({ 'Config.gs': code => code.replace("type: 'BREAK', minutes: 5", "type: 'BREAK', minutes: 0") });
  const problems = bad.json('validateScheduleConfig_()');
  assert.ok(problems.some(p => p.includes('MON_THU') && p.includes('duración')), problems.join(' | '));
});

test('validateScheduleConfig_: detecta un patrón sin bloques y una hora de inicio inválida', () => {
  const noBlocks = loadContext({
    'Config.gs': code => code.replace(/FRI: Object\.freeze\(\[[\s\S]*?\]\)\r?\n {2}\}\),/, 'FRI: Object.freeze([]) }),')
  });
  assert.ok(noBlocks.json('validateScheduleConfig_()').some(p => p.includes('FRI')));

  const badStart = loadContext({ 'Config.gs': code => code.replace("start: '19:00'", "start: '7pm'") });
  assert.ok(badStart.json('validateScheduleConfig_()').some(p => p.includes('Noche') && p.includes('inicio')));
});

test('validateScheduleConfig_: detecta un horario que excede las 24:00', () => {
  const late = loadContext({ 'Config.gs': code => code.replace("start: '19:00'", "start: '21:00'") });
  assert.ok(late.json('validateScheduleConfig_()').some(p => p.includes('Noche') && p.includes('24:00')));
});

// ── Visualización ────────────────────────────────────────────────────────────

test('formatAllJornadaSchedules_: muestra las tres jornadas con bloques y recesos en orden', () => {
  const text = env.run('formatAllJornadaSchedules_()');
  JORNADAS.forEach(j => assert.ok(text.includes(`JORNADA ${j.toUpperCase()} (inicio ${STARTS[j]})`), j));
  assert.equal((text.match(/Lunes a jueves:/g) || []).length, 3);
  assert.equal((text.match(/Viernes:/g) || []).length, 3);
  assert.equal((text.match(/Bloque 5 \(45 min\)/g) || []).length, 3, 'el bloque 5 aparece solo en lunes a jueves');
  assert.equal((text.match(/Receso \(5 min\)/g) || []).length, 3);
  assert.equal((text.match(/Receso \(10 min\)/g) || []).length, 9, 'un receso de 10 min en lun-jue y dos en viernes por jornada');
  assert.ok(text.includes('09:00 - 09:45  Bloque 1 (45 min)'));
  assert.ok(text.includes('Fin de clases: 12:10 (el receso final termina a las 12:20)'));
  assert.ok(text.includes('Fin de clases: 23:00'));
});
