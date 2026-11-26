/**
 * Utilidades SQL compartidas.
 */
'use strict';

/**
 * Arma "col1 = $1, col2 = $2" para un UPDATE parcial con solo los campos enviados.
 * Las columnas salen de `permitidas` (lista blanca), nunca del cliente.
 * @returns {{ sets: string, valores: any[] }}
 */
function actualizacionParcial(datos, permitidas) {
  const valores = [];
  const sets = permitidas
    .filter((col) => datos[col] !== undefined)
    .map((col) => {
      valores.push(datos[col]);
      return `${col} = $${valores.length}`;
    });
  return { sets: sets.join(', '), valores };
}

module.exports = { actualizacionParcial };
