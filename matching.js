import { db } from '../db.js';
import { buildEffectiveFleet } from './fleet.js';
import { dateRangesOverlap, daysBetween, PRIMARY_BSL2_IDS } from './rules.js';

function trailerCapableOf(trailer, category) {
  if (category === 'BSL2') {
    return trailer.applicationClass === 'BSL2 Only' || trailer.applicationClass === 'Hybrid BSL2/Pharmacy';
  }
  // Pharmacy
  return trailer.applicationClass === 'Pharmacy Only' || trailer.applicationClass === 'Hybrid BSL2/Pharmacy';
}

function bsl2Tier(trailer) {
  if (PRIMARY_BSL2_IDS.includes(trailer.trailerId.toUpperCase())) return 1; // purpose-built
  if (trailer.applicationClass === 'Hybrid BSL2/Pharmacy') return 2; // hybrid secondary
  if (trailer.applicationClass === 'Pharmacy Only') return 3; // last-resort backup
  return 4;
}

function getOtherActiveOpportunityAssignments(excludeOpportunityId) {
  return db
    .prepare(`SELECT * FROM opportunities WHERE removed = 0 AND status = 'assigned' AND id != ?`)
    .all(excludeOpportunityId || -1);
}

function trailerHasConflict(trailer, requiredStart, requiredEnd) {
  for (const a of trailer.assignments) {
    if (dateRangesOverlap(requiredStart, requiredEnd, a.start_date, a.end_date)) return true;
  }
  return false;
}

function earliestConflictFreeStart(trailer, requiredStart, requiredEnd) {
  const durationDays = daysBetween(requiredStart, requiredEnd);
  // Candidate starts: the true-available date, and the end date of every
  // existing assignment on this trailer (sorted).
  const candidates = [trailer.trueAvailableDate, ...trailer.assignments.map((a) => a.end_date)].filter(Boolean);
  candidates.sort();
  for (const candidateStart of candidates) {
    const candidateEndMs = new Date(candidateStart + 'T00:00:00Z').getTime() + durationDays * 86400000;
    const candidateEnd = new Date(candidateEndMs).toISOString().slice(0, 10);
    if (!trailerHasConflict(trailer, candidateStart, candidateEnd)) {
      return { start: candidateStart, end: candidateEnd };
    }
  }
  return null;
}

// Score higher = better fit. Deterministic and explainable.
function scoreTrailer(trailer, opportunity) {
  let score = 0;
  if (opportunity.category === 'BSL2') {
    const tier = bsl2Tier(trailer);
    score += (4 - tier) * 100; // tier 1 -> 300, tier 2 -> 200, tier 3 -> 100
    if (tier === 3) score -= 50; // protect pharmacy capacity - penalize using pharmacy-only for BSL2
  } else {
    // Pharmacy opportunity: prefer pharmacy-only first, protect hybrid/BSL2 capacity.
    if (trailer.applicationClass === 'Pharmacy Only') score += 300;
    else if (trailer.applicationClass === 'Hybrid BSL2/Pharmacy') score += 150;
  }
  score += (trailer.readinessScore || 0);
  score += trailer[opportunity.category === 'BSL2' ? 'bsl2Suitability' : 'pharmacySuitability'] || 0;

  const exactFit = !trailerHasConflict(trailer, opportunity.required_start, opportunity.required_end)
    && trailer.trueAvailableDate
    && trailer.trueAvailableDate <= opportunity.required_start;
  if (exactFit) score += 500;

  return score;
}

export function findMatch(opportunity) {
  const fleet = buildEffectiveFleet();
  const eligible = fleet.filter((t) => {
    if (!t.matchable) return false; // excludes sold / OOS / paired / excluded
    if (!trailerCapableOf(t, opportunity.category)) return false;
    if (!t.trueAvailableDate) return false; // unknown availability -> not usable for auto-match
    return true;
  });

  if (eligible.length === 0) {
    return { status: 'manual_review', reason: 'No eligible trailer matches the required capability.' };
  }

  const scored = eligible
    .map((t) => ({ trailer: t, score: scoreTrailer(t, opportunity) }))
    .sort((a, b) => b.score - a.score);

  for (const { trailer } of scored) {
    if (
      trailer.trueAvailableDate <= opportunity.required_start &&
      !trailerHasConflict(trailer, opportunity.required_start, opportunity.required_end)
    ) {
      return {
        status: 'assigned',
        trailerKey: trailer.trailerKey,
        trailerId: trailer.trailerId,
        trailerName: trailer.trailerName,
        recommendedStart: opportunity.required_start,
        recommendedEnd: opportunity.required_end,
        exactFit: true,
        notes: `Exact-fit match on ${trailer.trailerName} (${trailer.matchTier || 'tier n/a'}).`
      };
    }
  }

  // No exact fit - recommend best trailer's earliest conflict-free window.
  const best = scored[0].trailer;
  const shifted = earliestConflictFreeStart(best, opportunity.required_start, opportunity.required_end);
  if (shifted) {
    return {
      status: 'assigned',
      trailerKey: best.trailerKey,
      trailerId: best.trailerId,
      trailerName: best.trailerName,
      recommendedStart: shifted.start,
      recommendedEnd: shifted.end,
      exactFit: false,
      notes: `Earliest conflict-free window on ${best.trailerName}. Required dates could not be met exactly.`
    };
  }

  return { status: 'manual_review', reason: 'No conflict-free window found on any eligible trailer.' };
}
