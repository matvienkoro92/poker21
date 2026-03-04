/**
 * Задачи для Poker Streak Challenge — раздел «Научиться играть».
 * Формат: situation, question, options, correct_answer, explanation, player_cards, board_cards.
 * Карты: "As" (туз пики), "Kh" (король черви), "7c" (семёрка трефы), "3d" (тройка бубны).
 */
var POKER_STREAK_TASKS = [
  {
    id: "1",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш-игра, блайнды 1/2. Вы на ранней позиции (UTG) с парой королей.",
    question: "Какое первое действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Лимп (2)", action: "limp", amount: 2 },
      { id: "C", text: "Рейз 3BB (6)", action: "raise", amount: 6 },
      { id: "D", text: "Рейз 5BB (10)", action: "raise", amount: 10 }
    ],
    correct_answer: "C",
    explanation: "С сильной парой нужно рейзить стандартный размер 3BB для построения банка и отсечения слабых рук.",
    player_cards: ["Ks", "Kh"],
    board_cards: [],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "2",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш-игра. Вы на баттоне с 72o (разномастные семёрка и двойка).",
    question: "Какое действие?",
    options: [
      { id: "A", text: "Рейз", action: "raise" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Фолд", action: "fold" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "72o — одна из худших рук в покере. Даже на баттоне её нужно фолдить.",
    player_cards: ["7s", "2h"],
    board_cards: [],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "3",
    level: "beginner",
    stage: "preflop",
    situation: "MTT, блайнды 100/200. У вас 15BB в стеке. Все пасовали до вас на баттоне. У вас туз-король.",
    question: "Какое действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Мини-рейз 2BB", action: "raise", amount: 400 },
      { id: "C", text: "Олл-ин", action: "allin" },
      { id: "D", text: "Лимп", action: "limp" }
    ],
    correct_answer: "C",
    explanation: "С 15BB и AK на баттоне при пассе всех — олл-ин стандартное решение. Рука слишком сильная для фолда.",
    player_cards: ["As", "Kd"],
    board_cards: [],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "4",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: K♠ 7♥ 2♣. У вас топ-пара с королём и валетом. Оппонент сделал контбет 2/3 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз 3x", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "С топ-парой и хорошим кикером колл — правильное решение. Контролируем размер банка, ловим блефы.",
    player_cards: ["Ks", "Jh"],
    board_cards: ["Kd", "7h", "2c"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "5",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: A♠ 9♥ 3♣. У вас туз с кикером 8. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Топ-пара со средним кикером — колл. Рейз может выгнать слабее и оставить только сильнее.",
    player_cards: ["Ah", "8d"],
    board_cards: ["As", "9h", "3c"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "6",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: Q♠ J♥ 2♣. У вас 10-9 — стрит дро. Оппонент сделал большой бет 3/4 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Стрейт-дро с 8 аутсами — колл по хорошим оддсам. Рейз обычно не нужен — мы хотим дёшево добрать.",
    player_cards: ["Tc", "9d"],
    board_cards: ["Qs", "Jh", "2c"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "7",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: 7♠ 4♥ 2♣. У вас 7-4 — две пары. Оппонент чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/3 банка", action: "bet", amount: "1/3" },
      { id: "C", text: "Бет 2/3 банка", action: "bet", amount: "2/3" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "С двумя парами на сухом борде нужно ставить для вэлью. 2/3 банка — хороший размер.",
    player_cards: ["7h", "4d"],
    board_cards: ["7s", "4c", "2h"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "8",
    level: "beginner",
    stage: "turn",
    situation: "Терн: K♠ 7♥ 2♣ 3♦. У вас K-J. Оппонент чекнул на флопе и терне. Банк 100.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 50", action: "bet", amount: 50 },
      { id: "C", text: "Бет 75", action: "bet", amount: 75 },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "С топ-парой ставим 2/3–3/4 банка для вэлью. 75 — оптимальный размер.",
    player_cards: ["Kd", "Jc"],
    board_cards: ["Ks", "7h", "2c", "3d"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "9",
    level: "beginner",
    stage: "river",
    situation: "Ривер: A♠ K♥ 7♣ 3♦ 2♠. У вас A-Q. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Топ-пара с хорошим кикером. Колл — правильно. Рейз на ривере часто получает колл только от сильнее.",
    player_cards: ["Ah", "Qd"],
    board_cards: ["As", "Kh", "7c", "3d", "2s"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "10",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш 1/2. Вы в большой блайнде. Все пасовали, малый блайнд лимпнул.",
    question: "У вас 9-8 suited. Действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Рейз 3BB", action: "raise" },
      { id: "C", text: "Рейз 5BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "A",
    explanation: "В хедзапе с 98s против лимпера чек — нормально. Рейз тоже ок, но чек проще и дешевле.",
    player_cards: ["9h", "8h"],
    board_cards: [],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "11",
    level: "intermediate",
    stage: "preflop",
    situation: "MTT, 25BB. CO рейзнул 2.5BB. У вас JJ на баттоне.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 7BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "JJ — сильная рука. 3-бет изолирует CO и строит банк. Олл-ин с 25BB слишком агрессивен.",
    player_cards: ["Js", "Jh"],
    board_cards: [],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "12",
    level: "intermediate",
    stage: "flop",
    situation: "Флоп: A♠ K♥ 3♣. У вас A-Q. Вы рейзили префлоп, оппонент коллил. Он чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/3 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Топ-пара с топ-кикером на сухом борде. Ставим 2/3 для вэлью от слабее тузов и дро.",
    player_cards: ["Ad", "Qc"],
    board_cards: ["As", "Kh", "3c"],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "13",
    level: "intermediate",
    stage: "flop",
    situation: "Флоп: 9♥ 8♥ 2♣. У вас 7♥ 6♥ — флеш-дро и стрит-дро. Оппонент поставил 3/4 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Комбо-дро (флеш + стрит) — полублеф. Рейз: вэлью от дро, фолд-эквити, можем забрать сейчас.",
    player_cards: ["7h", "6h"],
    board_cards: ["9h", "8h", "2c"],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "14",
    level: "intermediate",
    stage: "turn",
    situation: "Терн: K♠ Q♥ 7♣ 2♦. У вас K-Q — две пары. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз 2.5x", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две топ-пары — очень сильная рука. Рейз для вэлью. Колл оставляет деньги на столе.",
    player_cards: ["Kd", "Qc"],
    board_cards: ["Ks", "Qh", "7c", "2d"],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "15",
    level: "intermediate",
    stage: "river",
    situation: "Ривер: A♠ K♥ 7♣ 4♦ 2♠. У вас A-7 — две пары. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Две пары, но борд сухой. Рейз часто получает колл только от A-K или сета. Колл — оптимально.",
    player_cards: ["Ah", "7d"],
    board_cards: ["As", "Kh", "7c", "4d", "2s"],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "16",
    level: "intermediate",
    stage: "preflop",
    situation: "Кэш. UTG рейзнул 3BB. У вас QQ в середине позиции.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 9BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "QQ против UTG рейза — 3-бет. Изолируем, строим банк. Колл допускает мультивей.",
    player_cards: ["Qs", "Qd"],
    board_cards: [],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "17",
    level: "intermediate",
    stage: "flop",
    situation: "Флоп: J♠ 9♥ 3♣. У вас J-9 — две пары. Оппонент чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 3/4 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары на сухом борде — ставим 2/3–3/4 для вэлью. Чек упускает вэлью.",
    player_cards: ["Jd", "9c"],
    board_cards: ["Js", "9h", "3c"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "18",
    level: "intermediate",
    stage: "turn",
    situation: "Терн: A♠ K♥ 7♣ 2♦. У вас A-2 — две пары (тузы и двойки). Оппонент поставил 2/3 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары на сухом борде — рейз для вэлью. A-K, A-7, 77, 22 — всё коллит.",
    player_cards: ["Ah", "2d"],
    board_cards: ["As", "Kh", "7c", "2d"],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "19",
    level: "intermediate",
    stage: "river",
    situation: "Ривер: K♠ Q♥ J♣ 10♦ 2♠. У вас 9-8 — стрит. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Стрит на борде с 4 подряд — рейз для вэлью. A-K, K-Q, Q-J и т.д. часто коллят.",
    player_cards: ["9h", "8d"],
    board_cards: ["Ks", "Qh", "Jc", "Td", "2s"],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "20",
    level: "intermediate",
    stage: "preflop",
    situation: "Кэш. CO рейзнул. У вас AQs на баттоне. Стеки 100BB.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "AQ suited против CO — 3-бет. Сильная рука, позиция, изоляция. Колл — слишком пассивно.",
    player_cards: ["As", "Qh"],
    board_cards: [],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "21",
    level: "expert",
    stage: "preflop",
    situation: "MTT, 12BB. HJ рейзнул 2.5BB. У вас 99 на баттоне.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 6BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "D",
    explanation: "С 12BB и 99 против HJ — олл-ин. Слишком короткий стек для 3-бета, колл невыгоден.",
    player_cards: ["9s", "9d"],
    board_cards: [],
    difficulty_multiplier: 1.5,
    time_limit: 20
  },
  {
    id: "22",
    level: "expert",
    stage: "flop",
    situation: "Флоп: A♠ 7♥ 2♣. У вас 7-7 — сет. Вы рейзили префлоп, оппонент коллил. Он чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/3 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Сет на сухом борде — малый бет. Хотим колл от A-x, дро. Большой бет выгонит слабее.",
    player_cards: ["7d", "7c"],
    board_cards: ["As", "7h", "2c"],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "23",
    level: "expert",
    stage: "turn",
    situation: "Терн: K♠ Q♥ 9♣ 2♦. У вас K-Q — две пары. Оппонент поставил 3/4 банка. SPR = 2.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "D",
    explanation: "С SPR=2 и двумя парами — коммитим стек. Олл-ин максимизирует вэлью и не даёт дро дёшево.",
    player_cards: ["Kd", "Qc"],
    board_cards: ["Ks", "Qh", "9c", "2d"],
    difficulty_multiplier: 1.5,
    time_limit: 20
  },
  {
    id: "24",
    level: "expert",
    stage: "river",
    situation: "Ривер: A♠ K♥ 7♣ 4♦ 3♠. У вас A-K. Оппонент поставил полбанка. Вы знаете, что он блефует 30%.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз 2x", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Топ-две пары. При 30% блефов колл — EV+. Рейз часто получает колл только от сета.",
    player_cards: ["Ah", "Kd"],
    board_cards: ["As", "Kh", "7c", "4d", "3s"],
    difficulty_multiplier: 1.6,
    time_limit: 20
  },
  {
    id: "25",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш 1/2. Вы в UTG с парой десяток.",
    question: "Какое действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Лимп", action: "limp" },
      { id: "C", text: "Рейз 3BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Пара десяток — сильная рука. Рейз 3BB стандартен с ранней позиции.",
    player_cards: ["Ts", "Th"],
    board_cards: [],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "26",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: 5♥ 4♥ 3♣. У вас 6-7 — стрит. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Стрит на борде — рейз для вэлью. Дро и пары часто коллят.",
    player_cards: ["6s", "7d"],
    board_cards: ["5h", "4h", "3c"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "27",
    level: "beginner",
    stage: "river",
    situation: "Ривер: 9♠ 8♥ 7♣ 6♦ 2♠. У вас 10-J — стрит. Оппонент чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Стрит на борде — ставим 2/3 для вэлью. Чек упускает деньги.",
    player_cards: ["Tc", "Jd"],
    board_cards: ["9s", "8h", "7c", "6d", "2s"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "28",
    level: "intermediate",
    stage: "preflop",
    situation: "MTT, 20BB. SB рейзнул 2.5BB. У вас AJo в BB.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 7BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "D",
    explanation: "С 20BB в BB против SB — AJo олл-ин. Хорошая рука для изоляции в хедзапе.",
    player_cards: ["As", "Jh"],
    board_cards: [],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "29",
    level: "intermediate",
    stage: "flop",
    situation: "Флоп: A♠ 8♥ 3♣. У вас A-3 — две пары. Оппонент поставил 2/3 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары на сухом борде — рейз. A-8, 88, 33 коллят. Максимизируем вэлью.",
    player_cards: ["Ah", "3d"],
    board_cards: ["As", "8h", "3c"],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "30",
    level: "intermediate",
    stage: "turn",
    situation: "Терн: K♠ 9♥ 4♣ 2♦. У вас K-9 — две пары. Оппонент чекнул на флопе и терне.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары, оппонент чекнул — ставим 2/3 для вэлью от K-x, 9-x, дро.",
    player_cards: ["Kd", "9c"],
    board_cards: ["Ks", "9h", "4c", "2d"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "31",
    level: "expert",
    stage: "preflop",
    situation: "Кэш. UTG+1 рейзнул 3BB. У вас TT в CO. Стеки 100BB.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 9BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "TT против UTG+1 рейза — колл. 3-бет против тайтового диапазона часто получает 4-бет от JJ+.",
    player_cards: ["Ts", "Td"],
    board_cards: [],
    difficulty_multiplier: 1.5,
    time_limit: 20
  },
  {
    id: "32",
    level: "expert",
    stage: "flop",
    situation: "Флоп: J♠ T♥ 3♣. У вас 9-8 — стрит-дро. Вы рейзили префлоп. Оппонент поставил 2/3 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Стрит-дро с 8 аутсами + бэкдор флеш — полублеф рейз. Фолд-эквити + вэлью при добре.",
    player_cards: ["9h", "8d"],
    board_cards: ["Js", "Th", "3c"],
    difficulty_multiplier: 1.5,
    time_limit: 20
  },
  {
    id: "33",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш. Все пасовали до SB. У вас A5o в SB.",
    question: "Действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Лимп", action: "limp" },
      { id: "C", text: "Рейз 2.5BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "A5o в SB при пассе всех — рейз. Слабый туз, но достаточно для изоляции BB.",
    player_cards: ["As", "5h"],
    board_cards: [],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "34",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: 2♠ 2♥ 2♣. У вас A-K. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "A",
    explanation: "Три двойки на борде. A-K не бьёт ни одну руку. Фолд — единственный вариант.",
    player_cards: ["Ah", "Kd"],
    board_cards: ["2s", "2h", "2c"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "35",
    level: "intermediate",
    stage: "river",
    situation: "Ривер: A♠ K♥ Q♣ J♦ 10♠. У вас 9-8 — стрит. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Стрит, но на борде роял-флеш дро. Рейз получает колл от стрита и выше. Колл — оптимально.",
    player_cards: ["9h", "8d"],
    board_cards: ["As", "Kh", "Qc", "Jd", "Ts"],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "36",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш. Вы на CO. Все пасовали. У вас пара валетов.",
    question: "Действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Лимп", action: "limp" },
      { id: "C", text: "Рейз 2.5BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Пара валетов на CO при пассе всех — рейз 2.5BB. Стандартная изоляция.",
    player_cards: ["Js", "Jh"],
    board_cards: [],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "37",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: K♠ 7♥ 2♣. У вас 7-2 — пара семёрок. Оппонент чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Средняя пара с плохим кикером. Малый бет для вэлью и защиты. Большой бет — овербет.",
    player_cards: ["7d", "2c"],
    board_cards: ["Ks", "7h", "2c"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "38",
    level: "intermediate",
    stage: "preflop",
    situation: "MTT, 8BB. BTN рейзнул 2BB. У вас 22 в BB.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 4BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "D",
    explanation: "С 8BB в BB с парой против BTN — олл-ин. Слишком короткий стек, 22 играется олл-ином.",
    player_cards: ["2s", "2h"],
    board_cards: [],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "39",
    level: "intermediate",
    stage: "turn",
    situation: "Терн: A♠ K♥ 4♣ 9♦. У вас A-4 — две пары. Оппонент поставил 3/4 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары (тузы и четвёрки). Рейз для вэлью. A-K, A-9, 99, 44 — всё в диапазоне колла.",
    player_cards: ["Ah", "4d"],
    board_cards: ["As", "Kh", "4c", "9d"],
    difficulty_multiplier: 1.2,
    time_limit: 20
  },
  {
    id: "40",
    level: "expert",
    stage: "river",
    situation: "Ривер: K♠ Q♥ J♣ 10♦ 2♠. У вас A-K — стрит. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Топ-стрит (туз-король). Рейз для вэлью. Q-J, J-10, K-Q и т.д. часто коллят.",
    player_cards: ["As", "Kd"],
    board_cards: ["Ks", "Qh", "Jc", "Td", "2s"],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "41",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш. BB. Все пасовали, SB лимпнул. У вас 9-8 suited.",
    question: "Действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Рейз 3BB", action: "raise" },
      { id: "C", text: "Рейз 5BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "98s в BB против лимпера — рейз 3BB. Хорошая рука для изоляции в хедзапе.",
    player_cards: ["9h", "8h"],
    board_cards: [],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "42",
    level: "beginner",
    stage: "flop",
    situation: "Флоп: A♠ A♥ 3♣. У вас A-3 — фулл-хаус. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Фулл-хаус — одна из сильнейших рук. Рейз для вэлью. A-x, 33 коллят.",
    player_cards: ["Ah", "3d"],
    board_cards: ["As", "Ac", "3h"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "43",
    level: "intermediate",
    stage: "preflop",
    situation: "Кэш. UTG рейзнул 3BB. У вас 99 в HJ.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 9BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "99 против UTG рейза — колл. 3-бет против тайтового диапазона часто получает 4-бет.",
    player_cards: ["9s", "9d"],
    board_cards: [],
    difficulty_multiplier: 1.3,
    time_limit: 20
  },
  {
    id: "44",
    level: "intermediate",
    stage: "flop",
    situation: "Флоп: 9♠ 8♥ 7♣. У вас 6-5 — стрит. Оппонент поставил 2/3 банка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Стрит на борде с дро — рейз для вэлью. Дро и пары часто коллят.",
    player_cards: ["6h", "5d"],
    board_cards: ["9s", "8h", "7c"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "45",
    level: "expert",
    stage: "preflop",
    situation: "MTT, 15BB. CO рейзнул 2.5BB. У вас AKo в BB.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "3-бет 7BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "D",
    explanation: "AKo с 15BB в BB против CO — олл-ин. Слишком сильная рука для колла, 3-бет коммитит.",
    player_cards: ["As", "Kh"],
    board_cards: [],
    difficulty_multiplier: 1.4,
    time_limit: 20
  },
  {
    id: "46",
    level: "beginner",
    stage: "river",
    situation: "Ривер: K♠ 7♥ 4♣ 2♦ 3♠. У вас K-7 — две пары. Оппонент чекнул.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары, оппонент чекнул — ставим 2/3 для вэлью от K-x, 7-x.",
    player_cards: ["Kd", "7c"],
    board_cards: ["Ks", "7h", "4c", "2d", "3s"],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "47",
    level: "intermediate",
    stage: "turn",
    situation: "Терн: A♠ K♥ 2♣ 9♦. У вас A-2 — две пары. Оппонент чекнул на флопе и терне.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Чек", action: "check" },
      { id: "B", text: "Бет 1/2 банка", action: "bet" },
      { id: "C", text: "Бет 2/3 банка", action: "bet" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "Две пары (тузы и двойки). Оппонент чекнул — ставим 2/3 для вэлью.",
    player_cards: ["Ah", "2d"],
    board_cards: ["As", "Kh", "2c", "9d"],
    difficulty_multiplier: 1.1,
    time_limit: 20
  },
  {
    id: "48",
    level: "expert",
    stage: "flop",
    situation: "Флоп: J♠ J♥ 7♣. У вас J-7 — фулл-хаус. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз 2.5x", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Фулл-хаус, но рейз может выгнать J-x и 77. Медленный колл — ловим вэлью на терне/ривере.",
    player_cards: ["Jd", "7h"],
    board_cards: ["Js", "Jc", "7d"],
    difficulty_multiplier: 1.5,
    time_limit: 20
  },
  {
    id: "49",
    level: "beginner",
    stage: "preflop",
    situation: "Кэш. Вы на баттоне. Все пасовали. У вас A4s.",
    question: "Действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Лимп", action: "limp" },
      { id: "C", text: "Рейз 2.5BB", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "C",
    explanation: "A4s на баттоне при пассе всех — рейз. Слабый туз, но suited и позиция.",
    player_cards: ["As", "4s"],
    board_cards: [],
    difficulty_multiplier: 1.0,
    time_limit: 20
  },
  {
    id: "50",
    level: "expert",
    stage: "river",
    situation: "Ривер: A♠ K♥ Q♣ J♦ 10♥. У вас 9♥ 8♥ — стрит. Оппонент поставил полбанка.",
    question: "Ваше действие?",
    options: [
      { id: "A", text: "Фолд", action: "fold" },
      { id: "B", text: "Колл", action: "call" },
      { id: "C", text: "Рейз", action: "raise" },
      { id: "D", text: "Олл-ин", action: "allin" }
    ],
    correct_answer: "B",
    explanation: "Стрит, но на борде роял. Рейз получает колл только от стрита и выше. Колл — правильно.",
    player_cards: ["9h", "8h"],
    board_cards: ["As", "Kh", "Qc", "Jd", "Th"],
    difficulty_multiplier: 1.5,
    time_limit: 20
  }
];
