/**
 * Lógica de puntuación — computada en cliente antes de escribir a Firestore.
 * Los valores de zona se leen de config/scoring.
 *
 * Todas las funciones son puras y no tienen efectos secundarios.
 */

/**
 * Calcula el delta neto de un intercambio normal (sin doble, sin contrapaso).
 *
 * @param {'hand'|'body'|'head'|'presa'} zone
 * @param {number} receiverCurrentPoints
 * @param {object} zoneValues   — de config.zone_values
 * @returns {{ pointsDelta: number, pointsRescued: number }}
 */
export function calcNormalHit(zone, receiverCurrentPoints, zoneValues) {
  const transfer = zoneValues[zone]
  const effective = Math.min(transfer, receiverCurrentPoints)
  return { pointsDelta: effective, pointsRescued: 0 }
}

/**
 * Calcula el delta neto cuando hay contrapaso.
 *
 * @param {'hand'|'body'|'head'|'presa'} hitZone       — golpe del atacante
 * @param {'hand'|'body'|'head'|'presa'} contrapasoZone — golpe de respuesta del receptor
 * @param {number} receiverCurrentPoints
 * @param {object} zoneValues
 * @returns {{ pointsDelta: number, pointsRescued: number }}
 */
export function calcContrapaso(hitZone, contrapasoZone, receiverCurrentPoints, zoneValues) {
  const hitValue = zoneValues[hitZone]
  const contrapasoValue = zoneValues[contrapasoZone]
  const netTransfer = Math.max(0, hitValue - contrapasoValue)
  const effective = Math.min(netTransfer, receiverCurrentPoints)
  const rescued = hitValue - netTransfer // puntos que el contrapaso evitó transferir
  return { pointsDelta: effective, pointsRescued: rescued }
}

/**
 * Calcula el delta neto de un doble.
 * Ambos tiradores pierden puntos simultáneamente — sin transferencia entre sí.
 *
 * @param {'hand'|'body'|'head'|'presa'} zoneRed
 * @param {'hand'|'body'|'head'|'presa'} zoneBlue
 * @param {number} pointsRed
 * @param {number} pointsBlue
 * @param {object} zoneValues
 * @returns {{ deltaRed: number, deltaBlue: number }}
 */
export function calcDouble(zoneRed, zoneBlue, pointsRed, pointsBlue, zoneValues) {
  return {
    deltaRed: Math.min(zoneValues[zoneRed], pointsRed),
    deltaBlue: Math.min(zoneValues[zoneBlue], pointsBlue),
  }
}

/**
 * Calcula la transferencia por desarme autoinfligido.
 *
 * @param {number|null} priorHitValue  — valor del golpe previo en el intercambio (null si no hubo)
 * @param {number} selfDisarmBase      — de config.self_disarm_base
 * @param {number} opponentCurrentPoints
 * @returns {number} puntos a transferir al oponente
 */
export function calcSelfDisarm(priorHitValue, selfDisarmBase, opponentCurrentPoints) {
  const transfer = Math.max(priorHitValue ?? 0, selfDisarmBase)
  return Math.min(transfer, opponentCurrentPoints)
}

/**
 * Calcula puntos de presa mutua (ambos pierden el valor de presa, sin transferencia).
 *
 * @param {number} pointsRed
 * @param {number} pointsBlue
 * @param {object} zoneValues
 * @returns {{ deltaRed: number, deltaBlue: number }}
 */
export function calcMutualPresa(pointsRed, pointsBlue, zoneValues) {
  const presaVal = zoneValues?.presa_mutua ?? 2
  return {
    deltaRed: Math.min(presaVal, pointsRed),
    deltaBlue: Math.min(presaVal, pointsBlue),
  }
}

/**
 * Calcula los puntos de calibración (bye) para una ronda.
 * Promedio de tiradores que completaron asaltos normales en esa ronda,
 * excluyendo ceros por tarjeta roja y otros calibrados.
 *
 * @param {number[]} roundPoints — puntos finales de tiradores que terminaron asaltos normales
 * @returns {number} valor con hasta 2 decimales
 */
export function calcCalibrationPoints(roundPoints) {
  if (roundPoints.length === 0) return 0
  const sum = roundPoints.reduce((acc, p) => acc + p, 0)
  return Math.round((sum / roundPoints.length) * 100) / 100
}
