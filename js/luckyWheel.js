// ======================================================
// LUCKY WHEEL
// Frontend animates the server-selected result.
// It must never use Math.random() for the production reward decision.
// ======================================================

import { callRewardFunction } from "./rewards.js";

export async function spinLuckyWheel() {
  // Requests a server-authorized spin. The backend selects the reward.
  return callRewardFunction("spinLuckyWheel");
}

export function animateWheel(element, segmentIndex, segmentCount = 8) {
  // Visual-only animation. segmentIndex comes from the trusted backend response.
  const segmentAngle = 360 / segmentCount;
  const target = 360 * 5 + (360 - segmentIndex * segmentAngle - segmentAngle / 2);
  element.style.transform = `rotate(${target}deg)`;
}
