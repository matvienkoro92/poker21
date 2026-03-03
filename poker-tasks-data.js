/**
 * Конструктор задач для раздела «Научиться играть» (SPR).
 * Чтобы добавить задачу — добавьте объект в массив POKER_TASKS.
 *
 * Схема задачи:
 * - heroPosition: позиция героя ("BB" | "UTG" | "UTG1" | "LJ" | "HJ" | "CO" | "BTN" | "SB")
 * - heroCards: массив карт [{ rank: "A" }, { rank: "J", red: true }] — без red = синяя (буби), red: true = красная (черви)
 * - dealerPosition: позиция дилера (обычно "BTN")
 * - positions: объект { [POS]: { stack: число, bet?: число } } — стек и опционально ставка в bb
 * - pot: { main: "25bb", bet: "6.7 bb", betPct: "23.9%", extra: "2.5 bb" }
 * - actions: { fold: "FOLD", call: "CALL", raise: "RAISE 7.1", allin: "ALLIN 25" }
 * - blueChips: true — фишки ставок синие; false — красные
 */
var POKER_TASK_POSITION_ORDER = ["BB", "UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"];

var POKER_TASKS = [
  {
    id: "1",
    heroPosition: "BTN",
    heroCards: [{ rank: "A" }, { rank: "J", red: true }],
    dealerPosition: "BTN",
    positions: {
      BB: { stack: 24, bet: 1 },
      UTG: { stack: 25 },
      UTG1: { stack: 22.9, bet: 2.1 },
      LJ: { stack: 25 },
      HJ: { stack: 25 },
      CO: { stack: 25 },
      BTN: { stack: 25 },
      SB: { stack: 24.5, bet: 0.5 }
    },
    pot: { main: "25bb", bet: "4.6 bb", betPct: "31.3%", extra: "2.5 bb" },
    actions: { fold: "FOLD", call: "CALL", raise: "RAISE 6.3", allin: "ALLIN 25" },
    blueChips: true
  }
];
