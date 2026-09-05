function players(rows) {
  return rows.slice().sort((a, b) => Number(b[5] || 0) - Number(a[5] || 0)
    || String(b[1] || '').localeCompare(String(a[1] || ''))
    || String(a[4] || '').localeCompare(String(b[4] || ''), 'ru'));
}

function history(rows) {
  return rows.slice().sort((a, b) => {
    const left = Date.parse(a[2]);
    const right = Date.parse(b[2]);
    return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
  });
}

module.exports = { players, history };
