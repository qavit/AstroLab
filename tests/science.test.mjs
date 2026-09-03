import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import * as ephemeris from "../lib/science/ephemeris.ts";
import * as frames from "../lib/science/frames.ts";
import * as time from "../lib/science/time.ts";
import * as atmosphere from "../lib/science/atmosphere.ts";
import * as coriolis from "../lib/science/coriolis.ts";
import * as geology from "../lib/science/geology.ts";
import * as projectile from "../lib/science/projectile.ts";
import { radians, solarDeclination } from "../lib/science/solar.ts";

/**
 * These tests check AstroLab's own adapter and coordinate chain, not astronomy-engine.
 * Where a number could only come from the library itself, the assertion is instead a physical
 * invariant (an eclipse requires the moon near a node) or an independently known fact
 * (the total solar eclipse of 12 August 2026), so a wiring mistake cannot pass by agreeing
 * with itself.
 */

const JD_2026 = time.julianDayFromUtc(2026, 1, 1);

test("idealized planetary wind belts have the textbook directions", () => {
  const parameters = { solarDeclination: 0, rotationRate: 1, surfaceDrag: 0.42 };
  assert.equal(atmosphere.surfaceWindAt(15, parameters).name, "東北信風");
  assert.equal(atmosphere.surfaceWindAt(-15, parameters).name, "東南信風");
  assert.equal(atmosphere.surfaceWindAt(45, parameters).name, "盛行西風");
  assert.equal(atmosphere.surfaceWindAt(75, parameters).name, "極地東風");
  assert.ok(atmosphere.surfaceWindAt(15, parameters).east < 0, "northern trade wind must be easterly");
  assert.ok(atmosphere.surfaceWindAt(45, parameters).east > 0, "midlatitude wind must be westerly");
  assert.ok(atmosphere.coriolisParameter(45) > 0);
  assert.ok(atmosphere.coriolisParameter(-45) < 0);
  assert.equal(atmosphere.coriolisParameter(0), 0);
});

test("rotating-frame coordinates match the inertial frame at t=0 and preserve distance from the axis", () => {
  const origin = { x: 0, y: 0 };
  const velocity = { x: 0.4, y: 1.6 };
  for (const omega of [-2, -0.3, 0.9, 2.7]) {
    const start = coriolis.inertialPosition(origin, velocity, 0);
    assert.deepEqual(coriolis.rotatingFramePosition(start, omega, 0), start);
    for (const t of [0.2, 0.5, 1.3, 2.4]) {
      const inertial = coriolis.inertialPosition(origin, velocity, t);
      const rotating = coriolis.rotatingFramePosition(inertial, omega, t);
      // A pure coordinate rotation cannot change a point's distance from the origin.
      const distanceInertial = Math.hypot(inertial.x, inertial.y);
      const distanceRotating = Math.hypot(rotating.x, rotating.y);
      assert.ok(Math.abs(distanceInertial - distanceRotating) < 1e-9, `distance preserved at omega=${omega} t=${t}`);
    }
  }
});

test("a body launched due north deflects to the right when the local spin matches the northern hemisphere", () => {
  // Positive angular velocity here plays the role of the northern hemisphere's sense of spin
  // (counterclockwise seen from above); real Coriolis deflection in the north is to the right.
  const origin = { x: 0, y: 0 };
  const dueNorth = { x: 0, y: 1 };
  const northOmega = coriolis.rotatingFramePosition(coriolis.inertialPosition(origin, dueNorth, 0.3), 1.2, 0.3);
  assert.ok(northOmega.x > 0, "northern-hemisphere-like spin should deflect a northward launch eastward (right)");
  const southOmega = coriolis.rotatingFramePosition(coriolis.inertialPosition(origin, dueNorth, 0.3), -1.2, 0.3);
  assert.ok(southOmega.x < 0, "southern-hemisphere-like spin should deflect a northward launch westward (left)");
  assert.equal(coriolis.deflectionSide(1.2), "right");
  assert.equal(coriolis.deflectionSide(-1.2), "left");
  assert.equal(coriolis.deflectionSide(0), "none");
});

test("Coriolis parameter and Foucault period follow their textbook latitude dependence", () => {
  assert.equal(coriolis.coriolisParameter(0, 1), 0);
  assert.ok(coriolis.coriolisParameter(45, 1) > 0);
  assert.ok(coriolis.coriolisParameter(-45, 1) < 0);
  assert.equal(coriolis.localAngularVelocity(90, 2), 2);

  assert.equal(coriolis.foucaultPeriodHours(0), Infinity);
  const pole = coriolis.foucaultPeriodHours(90);
  const midLatitude = coriolis.foucaultPeriodHours(45);
  // A pendulum at the pole completes one apparent rotation in one sidereal day (~23.93 h); at
  // lower latitudes it takes longer, diverging toward the equator.
  assert.ok(pole > 23.9 && pole < 24, `pole Foucault period ${pole}`);
  assert.ok(midLatitude > pole, "Foucault period must grow moving away from the pole");
  assert.ok(coriolis.foucaultPeriodHours(45, 2) < midLatitude, "doubling rotation rate halves the period");
});

test("season shifts the ITCZ without breaking pressure-belt order", () => {
  const june = atmosphere.pressureBands(23.44);
  const december = atmosphere.pressureBands(-23.44);
  assert.ok(june[3].latitude > 0);
  assert.ok(december[3].latitude < 0);
  for (const bands of [june, december]) {
    for (let index = 1; index < bands.length; index += 1) {
      assert.ok(bands[index].latitude > bands[index - 1].latitude);
      assert.notEqual(bands[index].kind, bands[index - 1].kind);
    }
  }
});

test("valley-rule preset produces a downstream V and east-west strike", () => {
  const valley = { valleyGradient: 0.28, valleyRelief: 0.17 };
  const bedding = { dipDirection: 180, dipAngle: 31, layerOffset: 0.08, layerThickness: 0.2 };
  const trace = geology.classifyValleyTrace(valley, bedding);
  assert.equal(trace.opens, "downstream");
  assert.ok(trace.dipIsSteeperThanValley);
  assert.equal(geology.beddingStrike(bedding.dipDirection), 90);
  assert.equal(geology.formatStrike(90), "東西向");
  assert.ok(geology.layerElevation(0, 1, bedding) > geology.layerElevation(0, -1, bedding));
});

test("terrain contours point upstream while the question outcrop points downstream", () => {
  const valley = { valleyGradient: 0.28, valleyRelief: 0.17 };
  const bedding = { dipDirection: 180, dipAngle: 31, layerOffset: 0.08, layerThickness: 0.2 };
  const contourAtAxis = (0.35 - valley.valleyRelief * 0 ** 2) / valley.valleyGradient;
  const contourAtSide = (0.35 - valley.valleyRelief * 1.5 ** 2) / valley.valleyGradient;
  assert.ok(contourAtAxis > contourAtSide, "contour V apex must lie upstream on the valley axis");
  const surfaceDifference = (x, y) => geology.terrainElevation(x, y, valley) - geology.layerElevation(x, y, bedding);
  const centerContactY = -surfaceDifference(0, 0) / (valley.valleyGradient - geology.layerNorthGradient(bedding));
  const sideContactY = centerContactY - valley.valleyRelief * 1.5 ** 2 / (valley.valleyGradient - geology.layerNorthGradient(bedding));
  assert.ok(sideContactY > centerContactY, "outcrop V arms must lie upstream of its downstream apex");
});

test("Julian Day anchors and round trips", () => {
  // The J2000 epoch is defined as JD 2451545.0 at 2000-01-01 12:00 UTC.
  assert.equal(time.julianDayFromUtc(2000, 1, 1, 12), 2451545);
  assert.equal(time.J2000_JULIAN_DAY, 2451545);
  // The Julian day starts at noon, so midnight UTC always lands on a half day.
  assert.equal(time.julianDayFromUtc(1970, 1, 1) % 1, 0.5);
  assert.equal(time.julianDayFromUtc(1970, 1, 1), 2440587.5);

  for (const iso of ["1900-01-01T00:00:00Z", "2026-08-02T13:45:30Z", "2100-12-31T23:59:59Z"]) {
    const date = new Date(iso);
    assert.equal(time.dateFromJulianDay(time.julianDayFromDate(date)).toISOString(), date.toISOString());
  }

  assert.equal(time.j2000DaysFromJulianDay(time.julianDayFromUtc(2000, 1, 1, 12)), 0);
  assert.equal(time.dayOfYearFromJulianDay(time.julianDayFromUtc(2026, 1, 1)), 1);
  assert.equal(time.dayOfYearFromJulianDay(time.julianDayFromUtc(2026, 12, 31)), 365);
  // 2024 is a leap year, so it has a day 366.
  assert.equal(time.dayOfYearFromJulianDay(time.julianDayFromUtc(2024, 12, 31)), 366);
  assert.equal(time.julianDayForDayOfYear(2026, 1), time.julianDayFromUtc(2026, 1, 1));
});

test("coordinate frames round trip and honour their defining angles", () => {
  const obliquity = frames.MEAN_OBLIQUITY_J2000;

  // The June solstice point: ecliptic longitude 90 sits at the ecliptic's greatest declination.
  const solstice = frames.eclipticToEquatorial(90, 0, obliquity);
  assert.ok(Math.abs(solstice.rightAscension - 90) < 1e-9, `RA ${solstice.rightAscension}`);
  assert.ok(Math.abs(solstice.declination - obliquity) < 1e-9, `dec ${solstice.declination}`);
  // The equinox points are where the two frames coincide.
  const equinox = frames.eclipticToEquatorial(0, 0, obliquity);
  assert.ok(Math.abs(equinox.rightAscension) < 1e-9);
  assert.ok(Math.abs(equinox.declination) < 1e-9);

  for (let longitude = 0; longitude < 360; longitude += 17) {
    for (const latitude of [-70, -25, 0, 25, 70]) {
      const equatorialCoords = frames.eclipticToEquatorial(longitude, latitude, obliquity);
      const back = frames.equatorialToEcliptic(
        equatorialCoords.rightAscension,
        equatorialCoords.declination,
        obliquity,
      );
      assert.ok(
        Math.abs(frames.signedDegrees(back.longitude - longitude)) < 1e-9,
        `ecliptic longitude round trip at ${longitude}/${latitude}`,
      );
      assert.ok(Math.abs(back.latitude - latitude) < 1e-9, `ecliptic latitude round trip at ${longitude}/${latitude}`);

      for (const observerLatitude of [-66.5, -23.5, 0, 23.5, 45, 66.5]) {
        const horizontal = frames.equatorialToHorizontal(longitude, latitude, observerLatitude);
        const restored = frames.horizontalToEquatorial(horizontal.azimuth, horizontal.altitude, observerLatitude);
        assert.ok(
          Math.abs(frames.signedDegrees(restored.hourAngle - longitude)) < 1e-8,
          `hour angle round trip at ${longitude}/${latitude}/${observerLatitude}`,
        );
        assert.ok(Math.abs(restored.declination - latitude) < 1e-8, "declination round trip");
      }
    }
  }
});

test("horizontal coordinates put the celestial pole where the latitude says", () => {
  for (const latitude of [10, 23.5, 45, 70]) {
    // The pole sits due north at an altitude equal to the observer's latitude.
    const pole = frames.equatorialToHorizontal(0, 90, latitude);
    assert.ok(Math.abs(pole.altitude - latitude) < 1e-9, `pole altitude at ${latitude}`);
    assert.ok(Math.abs(frames.signedDegrees(pole.azimuth)) < 1e-9, `pole azimuth at ${latitude}`);
    // A body on the equator crossing the meridian is due south of a northern observer.
    const meridian = frames.equatorialToHorizontal(0, 0, latitude);
    assert.ok(Math.abs(meridian.altitude - (90 - latitude)) < 1e-9);
    assert.ok(Math.abs(meridian.azimuth - 180) < 1e-9);
  }
});

test("angular separation and longitude wrapping", () => {
  assert.equal(frames.normalizeDegrees(-1), 359);
  assert.equal(frames.signedDegrees(359), -1);
  assert.equal(frames.signedDegrees(180), 180);
  assert.ok(Math.abs(frames.angularSeparation(0, 0, 90, 0) - 90) < 1e-9);
  assert.ok(Math.abs(frames.angularSeparation(0, -30, 0, 30) - 60) < 1e-9);
  assert.ok(Math.abs(frames.angularSeparation(123, 45, 123, 45)) < 1e-9);
});

test("the seasons land where the sun's ecliptic longitude says they must", () => {
  const seasons = ephemeris.seasonJulianDays(2026);
  const expected = {
    marchEquinox: 0,
    juneSolstice: 90,
    septemberEquinox: 180,
    decemberSolstice: 270,
  };
  for (const [season, targetLongitude] of Object.entries(expected)) {
    const jd = seasons[season];
    const sun = ephemeris.geocentric("sun", jd);
    assert.ok(
      Math.abs(frames.signedDegrees(sun.longitude - targetLongitude)) < 1e-3,
      `${season}: solar longitude ${sun.longitude}`,
    );
    // The sun defines the ecliptic, so it never leaves it.
    assert.ok(Math.abs(sun.latitude) < 1e-3, `${season}: solar latitude ${sun.latitude}`);
  }

  // At the solstices the sun's declination reaches the obliquity of the ecliptic.
  assert.ok(Math.abs(ephemeris.geocentricEquatorial("sun", seasons.juneSolstice).declination - 23.44) < 0.01);
  assert.ok(Math.abs(ephemeris.geocentricEquatorial("sun", seasons.decemberSolstice).declination + 23.44) < 0.01);
  assert.ok(Math.abs(ephemeris.geocentricEquatorial("sun", seasons.marchEquinox).declination) < 0.01);
});

test("the earth's heliocentric longitude is the sun's geocentric longitude turned around", () => {
  for (let month = 1; month <= 12; month += 1) {
    const jd = time.julianDayFromUtc(2026, month, 15);
    const earth = ephemeris.heliocentric("earth", jd);
    const sun = ephemeris.geocentric("sun", jd);
    const difference = frames.signedDegrees(earth.longitude - sun.longitude - 180);
    // They are not exactly opposite: the geocentric sun is where it is *seen*, displaced by
    // aberration, about 20.5 arcseconds. Anything larger means a frame has been mixed up.
    assert.ok(Math.abs(difference) < 0.01, `month ${month}: residual ${difference * 3600} arcsec`);
    assert.ok(Math.abs(difference * 3600) > 10, `month ${month}: aberration should not vanish`);
    // Earth's orbit is nearly circular, and the sun's distance must agree from either end.
    assert.ok(earth.distance > 0.98 && earth.distance < 1.02, `earth distance ${earth.distance}`);
    assert.ok(Math.abs(earth.distance - sun.distance) < 1e-3);
  }
});

test("AstroLab's own ecliptic-to-equatorial chain reproduces the ephemeris", () => {
  // Independent paths to the same answer: our spherical trigonometry applied to the
  // ephemeris' ecliptic position, against the ephemeris' own equatorial position.
  let maxRightAscensionError = 0;
  let maxDeclinationError = 0;
  for (let month = 1; month <= 12; month += 1) {
    for (const body of ["sun", "moon", "mars"]) {
      const jd = time.julianDayFromUtc(2026, month, 15);
      const ecliptic = ephemeris.geocentric(body, jd);
      const mine = frames.eclipticToEquatorial(ecliptic.longitude, ecliptic.latitude, 23.4372);
      const theirs = ephemeris.geocentricEquatorial(body, jd);
      maxRightAscensionError = Math.max(
        maxRightAscensionError,
        Math.abs(frames.signedDegrees(mine.rightAscension - theirs.rightAscension)),
      );
      maxDeclinationError = Math.max(maxDeclinationError, Math.abs(mine.declination - theirs.declination));
    }
  }
  // The remaining disagreement is the obliquity of date versus the fixed value used above.
  assert.ok(maxRightAscensionError < 0.01, `right ascension error ${maxRightAscensionError}°`);
  assert.ok(maxDeclinationError < 0.01, `declination error ${maxDeclinationError}°`);
});

test("geocentric and topocentric positions differ only for the moon", () => {
  // Diurnal parallax: an observer standing on the surface sees the moon displaced by up to
  // about a degree from where an observer at the earth's centre would. Keeping the two apart
  // is why the adapter names them separately instead of defaulting an observer to (0, 0).
  const jd = time.julianDayFromUtc(2026, 11, 15);
  const separation = (body, latitude) => {
    const centre = ephemeris.geocentricEquatorial(body, jd);
    const surface = ephemeris.topocentricEquatorial(body, jd, latitude, 0);
    return frames.angularSeparation(
      centre.rightAscension,
      centre.declination,
      surface.rightAscension,
      surface.declination,
    );
  };
  assert.ok(separation("moon", 0) > 0.2, `lunar parallax should be visible, got ${separation("moon", 0)}°`);
  assert.ok(separation("moon", 0) < 1.1, "lunar parallax cannot exceed about a degree");
  assert.ok(separation("sun", 0) < 0.01, "solar parallax is negligible at this scale");
  assert.ok(separation("mars", 0) < 0.01, "planetary parallax is negligible at this scale");
});

test("the solar-sphere model's declination approximation stays within its documented error", () => {
  let maxError = 0;
  let worstDay = 0;
  for (let day = 1; day <= 365; day += 1) {
    const jd = time.julianDayForDayOfYear(2026, day);
    const trueDeclination = ephemeris.geocentricEquatorial("sun", jd).declination;
    const approximate = radians(solarDeclination(day));
    const error = Math.abs(trueDeclination - approximate);
    if (error > maxError) {
      maxError = error;
      worstDay = day;
    }
  }
  // Model 01 deliberately uses a smooth periodic approximation. This records what that costs:
  // under 2 degrees all year, worst in early October. It is a bound, not a target.
  assert.ok(maxError < 2, `worst declination error ${maxError.toFixed(3)}° on day ${worstDay}`);
  assert.ok(maxError > 1, "approximation error unexpectedly small — check which model is under test");
});

test("moon phases match their defining sun-earth-moon geometry", () => {
  const expectations = {
    new: { phase: 0, illuminated: 0, elongation: 0 },
    firstQuarter: { phase: 90, illuminated: 0.5, elongation: 90 },
    full: { phase: 180, illuminated: 1, elongation: 180 },
    lastQuarter: { phase: 270, illuminated: 0.5, elongation: 90 },
  };
  const seen = new Set();
  let jd = time.julianDayFromUtc(2026, 8, 1);
  for (let index = 0; index < 4; index += 1) {
    const quarter = ephemeris.nextMoonQuarter(jd);
    const phase = ephemeris.moonPhase(quarter.julianDay);
    const expected = expectations[quarter.quarter];
    seen.add(quarter.quarter);

    assert.ok(Math.abs(frames.signedDegrees(phase.phase - expected.phase)) < 0.01, `${quarter.quarter} phase`);
    assert.ok(Math.abs(phase.illuminated - expected.illuminated) < 0.01, `${quarter.quarter} illumination`);
    // Elongation is the angle actually seen in the sky, so at new and full it falls a little
    // short of 0 and 180 by however far the moon sits off the ecliptic.
    assert.ok(Math.abs(phase.elongation - expected.elongation) < 1.5, `${quarter.quarter} elongation`);
    assert.ok(phase.age >= 0 && phase.age < 29.6, `${quarter.quarter} age ${phase.age}`);
    jd = quarter.julianDay + 0.5;
  }
  assert.equal(seen.size, 4, "one full cycle should visit every quarter");

  // Age runs from the previous new moon, so it resets there.
  const newMoon = ephemeris.nextMoonQuarter(time.julianDayFromUtc(2026, 8, 10));
  assert.equal(newMoon.quarter, "new");
  assert.ok(ephemeris.moonPhase(newMoon.julianDay).age < 0.01);
  assert.ok(ephemeris.moonPhase(newMoon.julianDay + 7).age > 6.9);
});

test("eclipses only happen when the moon is near a node", () => {
  // This is the reason there is not an eclipse every month, and the reason the orrery draws
  // the line of nodes at all. The moon must be within roughly 1.6 degrees of the ecliptic.
  let jd = JD_2026;
  for (let index = 0; index < 6; index += 1) {
    const eclipse = ephemeris.nextSolarEclipse(jd);
    const moon = ephemeris.geocentric("moon", eclipse.julianDay);
    const phase = ephemeris.moonPhase(eclipse.julianDay);
    assert.ok(Math.abs(moon.latitude) < 1.6, `solar eclipse moon latitude ${moon.latitude}`);
    // A solar eclipse is by definition a new moon.
    assert.ok(Math.abs(frames.signedDegrees(phase.phase)) < 0.2, `solar eclipse phase ${phase.phase}`);
    jd = eclipse.julianDay + 1;
  }

  jd = JD_2026;
  for (let index = 0; index < 5; index += 1) {
    const eclipse = ephemeris.nextLunarEclipse(jd);
    const moon = ephemeris.geocentric("moon", eclipse.julianDay);
    const phase = ephemeris.moonPhase(eclipse.julianDay);
    assert.ok(Math.abs(moon.latitude) < 1.6, `lunar eclipse moon latitude ${moon.latitude}`);
    // A lunar eclipse is by definition a full moon.
    assert.ok(Math.abs(frames.signedDegrees(phase.phase - 180)) < 0.3, `lunar eclipse phase ${phase.phase}`);
    jd = eclipse.julianDay + 1;
  }
});

test("known eclipses land on their published dates", () => {
  // The total solar eclipse of 12 August 2026, crossing Greenland, Iceland and Spain.
  let jd = JD_2026;
  let totalSolar = ephemeris.nextSolarEclipse(jd);
  while (totalSolar.kind !== "total") totalSolar = ephemeris.nextSolarEclipse(totalSolar.julianDay + 1);
  assert.equal(time.formatUtcDate(totalSolar.julianDay), "2026 年 8 月 12 日");
  assert.equal(totalSolar.kind, "total");

  // The total lunar eclipse of 3 March 2026.
  const lunar = ephemeris.nextLunarEclipse(time.julianDayFromUtc(2026, 2, 1));
  assert.equal(time.formatUtcDate(lunar.julianDay), "2026 年 3 月 3 日");
  assert.equal(lunar.kind, "total");

  // A node crossing falls within days of every eclipse — the eclipse season.
  const node = ephemeris.nextMoonNode(totalSolar.julianDay - 5);
  assert.ok(Math.abs(node.julianDay - totalSolar.julianDay) < 5, "node should be close to the eclipse");
  assert.ok(node.kind === "ascending" || node.kind === "descending");
});

test("an outer planet moves backwards only around opposition", () => {
  // Apparent retrograde motion is the orrery's payoff: it is geometry, not a planet reversing.
  const longitudeRate = (jd) =>
    frames.signedDegrees(
      ephemeris.geocentric("mars", jd + 0.5).longitude - ephemeris.geocentric("mars", jd - 0.5).longitude,
    );

  let oppositionJd = 0;
  let greatestElongation = 0;
  for (let day = 0; day < 500; day += 1) {
    const jd = JD_2026 + day;
    const elongation = ephemeris.elongation("mars", jd);
    if (elongation > greatestElongation) {
      greatestElongation = elongation;
      oppositionJd = jd;
    }
  }
  assert.ok(greatestElongation > 170, `Mars should reach opposition, got ${greatestElongation}°`);

  assert.ok(longitudeRate(oppositionJd) < 0, "Mars should be retrograde at opposition");
  assert.ok(longitudeRate(oppositionJd - 60) > 0, "Mars should be direct well before opposition");
  assert.ok(longitudeRate(oppositionJd + 60) > 0, "Mars should be direct well after opposition");
});

test("inner planets stay within their greatest elongations", () => {
  // Mercury and Venus never stray far from the sun, which is why they are only ever seen
  // near dawn or dusk. These bounds are the textbook ones.
  for (let day = 0; day < 400; day += 3) {
    const jd = JD_2026 + day;
    assert.ok(ephemeris.elongation("mercury", jd) < 29, "Mercury elongation");
    assert.ok(ephemeris.elongation("venus", jd) < 48, "Venus elongation");
  }
  const venus = ephemeris.nextMaxElongation("venus", JD_2026);
  assert.ok(venus.elongation > 44 && venus.elongation < 48, `Venus greatest elongation ${venus.elongation}`);
  assert.ok(venus.visibility === "morning" || venus.visibility === "evening");
  const mercury = ephemeris.nextMaxElongation("mercury", JD_2026);
  assert.ok(mercury.elongation > 17 && mercury.elongation < 29, `Mercury greatest elongation ${mercury.elongation}`);
});

test("planets keep to the ecliptic and to their orbital distances", () => {
  const distances = {
    mercury: [0.30, 0.47],
    venus: [0.71, 0.74],
    earth: [0.98, 1.02],
    mars: [1.38, 1.67],
    jupiter: [4.94, 5.46],
    saturn: [9.0, 10.1],
    uranus: [18.2, 20.1],
    neptune: [29.7, 30.4],
  };
  for (const body of ephemeris.PLANETS) {
    const position = ephemeris.heliocentric(body, JD_2026);
    const [minimum, maximum] = distances[body];
    assert.ok(
      position.distance >= minimum && position.distance <= maximum,
      `${body} heliocentric distance ${position.distance} outside ${minimum}–${maximum} AU`,
    );
    // Every planet's orbit is tilted only slightly from the earth's, which is what lets the
    // orrery draw them all in one plane without lying much.
    assert.ok(Math.abs(position.latitude) < 8, `${body} ecliptic latitude ${position.latitude}`);
    // The cartesian form must agree with the spherical one.
    const spherical = frames.cartesianToSpherical(position.vector);
    assert.ok(Math.abs(frames.signedDegrees(spherical.longitude - position.longitude)) < 1e-9, `${body} longitude`);
    assert.ok(Math.abs(spherical.latitude - position.latitude) < 1e-9, `${body} latitude`);
    assert.ok(Math.abs(spherical.radius - position.distance) < 1e-12, `${body} radius`);
  }
});

test("the observer view sees the sun where the solar-sphere model puts it", () => {
  // The orrery's ground view and model 01 must agree, or the two models teach different skies.
  const seasons = ephemeris.seasonJulianDays(2026);
  for (const latitude of [-35, 0, 23.5, 51]) {
    const noon = ephemeris.horizontal("sun", seasons.juneSolstice, latitude, 0);
    const declination = ephemeris.geocentricEquatorial("sun", seasons.juneSolstice).declination;
    // Whatever the time of day, the sun can never exceed its noon altitude for that latitude.
    const maximumAltitude = 90 - Math.abs(latitude - declination);
    assert.ok(noon.altitude <= maximumAltitude + 0.6, `latitude ${latitude}: ${noon.altitude} > ${maximumAltitude}`);
    assert.ok(noon.altitude >= -90 && noon.altitude <= 90);
    assert.ok(noon.azimuth >= 0 && noon.azimuth < 360);
  }
});

test("only the ephemeris adapter imports astronomy-engine", async () => {
  const roots = ["app", "components", "lib", "models"];
  const offenders = [];
  const walk = async (directory) => {
    for (const entry of await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      if (/from "astronomy-engine"/.test(source) && path !== "lib/science/ephemeris.ts") offenders.push(path);
    }
  };
  await Promise.all(roots.map(walk));
  assert.deepEqual(offenders, [], "astronomy-engine must stay behind lib/science/ephemeris.ts");

  const adapter = await readFile(new URL("../lib/science/ephemeris.ts", import.meta.url), "utf8");
  assert.match(adapter, /from "astronomy-engine"/);
  // The adapter must not leak the library's own types outward.
  assert.doesNotMatch(adapter, /export .*\b(AstroTime|Vector|Observer|EclipticCoordinates)\b/);
});

/* ------------------------------------------------------------------------------------------
 * Projectile motion
 *
 * The vacuum results are checked as invariants a wrong formula could not satisfy by accident —
 * energy conservation, the 45° optimum, the envelope bounding every trajectory it caps — rather
 * than against numbers this module produced itself. The drag integrator is checked against the
 * closed form it exists to generalize, by running it with the drag switched off.
 * --------------------------------------------------------------------------------------- */

const G = projectile.STANDARD_GRAVITY;

test("45° is the farthest angle only when launch and landing heights match", () => {
  const speed = 24;
  const level = projectile.range(speed, 45, 0, G);
  for (const angle of [15, 25, 35, 44, 46, 55, 65, 75]) {
    assert.ok(projectile.range(speed, angle, 0, G) <= level + 1e-9, `45° must beat ${angle}° on level ground`);
  }
  assert.ok(Math.abs(projectile.optimalAngle(speed, 0, G) - 45) < 1e-9);

  // Raising the launch point makes the optimum shallower, and it stops being 45°.
  const elevated = projectile.optimalAngle(speed, 30, G);
  assert.ok(elevated < 45 && elevated > 0, "an elevated launch peaks below 45°");
  assert.ok(projectile.range(speed, elevated, 30, G) >= projectile.range(speed, 45, 30, G));
});

test("complementary angles share a range on level ground and stop sharing it once raised", () => {
  const speed = 18;
  for (const angle of [20, 35, 55]) {
    const partner = projectile.complementaryAngle(angle);
    const a = projectile.range(speed, angle, 0, G);
    const b = projectile.range(speed, partner, 0, G);
    assert.ok(Math.abs(a - b) < 1e-9, `${angle}° and ${partner}° must land together on level ground`);
  }
  const raised = 25;
  const low = projectile.range(speed, 30, raised, G);
  const high = projectile.range(speed, 60, raised, G);
  assert.ok(Math.abs(low - high) > 1, "an elevated launch breaks the complementary-angle pairing");
  assert.ok(low > high, "the shallower of the pair wins once the launch point is raised");
});

test("vacuum flight conserves energy and peaks where the vertical velocity vanishes", () => {
  const velocity = projectile.launchVelocity(22, 52);
  const height = 12;
  const duration = projectile.flightTime(velocity, height, G);
  const initial = 0.5 * 22 ** 2 + G * height;
  for (const sample of projectile.sampleTrajectory(velocity, height, G, duration, 40)) {
    const speedSquared = sample.velocity.x ** 2 + sample.velocity.y ** 2;
    assert.ok(Math.abs(0.5 * speedSquared + G * sample.point.y - initial) < 1e-6, "½v² + gy must not drift");
  }
  const peak = projectile.apex(velocity, height, G);
  assert.ok(Math.abs(projectile.velocityAt(velocity, G, peak.t).y) < 1e-9, "v_y is zero at the apex");
  assert.equal(projectile.apex(projectile.launchVelocity(22, -20), height, G).t, 0, "a downward launch peaks at t = 0");
});

test("the safety parabola bounds every trajectory at that speed and no higher one exists", () => {
  const speed = 20;
  for (const angle of [10, 25, 40, 55, 70, 85]) {
    const velocity = projectile.launchVelocity(speed, angle);
    const duration = projectile.flightTime(velocity, 0, G);
    for (const sample of projectile.sampleTrajectory(velocity, 0, G, duration, 60)) {
      const ceiling = projectile.envelopeHeight(sample.point.x, speed, 0, G);
      assert.ok(sample.point.y <= ceiling + 1e-6, `${angle}° escaped the envelope at x = ${sample.point.x}`);
    }
  }
  // The envelope is tight, not merely an upper bound: the optimal angle reaches its ground point.
  const reach = projectile.envelopeReach(speed, 0, G);
  assert.ok(Math.abs(reach - projectile.range(speed, projectile.optimalAngle(speed, 0, G), 0, G)) < 1e-6);
  assert.ok(Math.abs(projectile.envelopeHeight(reach, speed, 0, G)) < 1e-6, "the envelope meets the ground at max range");
});

test("both solutions of the two-angle problem hit the same target", () => {
  const speed = 30;
  const target = { x: 40, y: 10 };
  const angles = projectile.anglesToTarget(target.x, target.y, speed, G);
  assert.ok(angles && angles.low < angles.high, "a reachable target has a low and a high solution");
  for (const angle of [angles.low, angles.high]) {
    const velocity = projectile.launchVelocity(speed, angle);
    const t = target.x / velocity.x;
    const y = projectile.position(velocity, 0, G, t).y;
    assert.ok(Math.abs(y - target.y) < 1e-6, `${angle}° must pass through the target`);
  }
  assert.equal(projectile.anglesToTarget(1000, 0, speed, G), null, "a target beyond the envelope is unreachable");
});

test("gravity splits into tangential and normal parts that always recombine to g", () => {
  const velocity = projectile.launchVelocity(19, 40);
  const duration = projectile.flightTime(velocity, 0, G);
  for (let index = 0; index <= 20; index += 1) {
    const t = (duration * index) / 20;
    const split = projectile.pathAcceleration(velocity, G, t);
    assert.ok(Math.abs(Math.hypot(split.tangential, split.normal) - G) < 1e-9, "a∥² + a⊥² = g²");
    assert.ok(split.normal >= 0);
  }
  const rising = projectile.pathAcceleration(velocity, G, 0.1);
  const falling = projectile.pathAcceleration(velocity, G, duration - 0.1);
  assert.ok(rising.tangential < 0 && falling.tangential > 0, "gravity slows the climb and speeds the descent");

  // At the apex the path is slowest and bending hardest: all of gravity is normal there.
  const peak = projectile.apex(velocity, 0, G);
  const atApex = projectile.pathAcceleration(velocity, G, peak.t);
  assert.ok(Math.abs(atApex.tangential) < 1e-9 && Math.abs(atApex.normal - G) < 1e-9);
  assert.ok(atApex.curvature > rising.curvature && atApex.curvature > falling.curvature, "curvature is maximal at the apex");
});

test("the staircase landing agrees with the horizontal-launch closed form", () => {
  const stairs = { width: 0.3, rise: 0.18, count: 40 };
  for (const speed of [1.5, 3, 6, 9]) {
    const landing = projectile.staircaseLanding(projectile.launchVelocity(speed, 0), G, stairs);
    assert.ok(landing, `speed ${speed} must land on the stairs`);
    assert.equal(landing.step, projectile.horizontalStaircaseStep(speed, G, stairs), "n = ⌈2v²·rise / (g·width²)⌉");
    assert.ok(landing.point.x <= landing.step * stairs.width + 1e-9, "the landing is on that step's tread");
    assert.ok(landing.point.x > (landing.step - 1) * stairs.width - 1e-9, "and not on the one before it");
  }
  // Range along the stairs grows with the square of the launch speed, so the step index does too.
  const slow = projectile.staircaseLanding(projectile.launchVelocity(3, 0), G, stairs).step;
  const fast = projectile.staircaseLanding(projectile.launchVelocity(6, 0), G, stairs).step;
  assert.ok(fast >= 3.5 * slow, "doubling the speed moves the landing about four steps' worth further");
  assert.equal(projectile.staircaseLanding(projectile.launchVelocity(40, 0), G, { ...stairs, count: 3 }), null);
});

test("the drag integrator reproduces the closed form when drag is switched off", () => {
  const velocity = projectile.launchVelocity(26, 38);
  const height = 8;
  const exact = projectile.flightTime(velocity, height, G);
  const exactRange = velocity.x * exact;

  const integrated = projectile.sampleDragTrajectory(velocity, height, G, 0);
  const landing = integrated[integrated.length - 1];
  assert.ok(Math.abs(landing.t - exact) < 1e-3, "RK4 with no drag must land when the formula says");
  assert.ok(Math.abs(landing.point.x - exactRange) < 1e-2, "and where the formula says");

  // With drag on, the flight must fall short — that is the entire comparison the model draws.
  const dragged = projectile.sampleDragTrajectory(velocity, height, G, projectile.DRAG_PRESETS.shuttlecock.value);
  const draggedLanding = dragged[dragged.length - 1];
  assert.ok(draggedLanding.point.x < exactRange, "air resistance shortens the range");
  assert.ok(Math.hypot(draggedLanding.velocity.x, draggedLanding.velocity.y) < 26, "and it lands slower than it left");
});

test("other bodies keep the shape and change only the scale", () => {
  const speed = 20;
  const earth = projectile.range(speed, 45, 0, GRAVITY_OF("earth"));
  const moon = projectile.range(speed, 45, 0, GRAVITY_OF("moon"));
  assert.ok(moon > earth, "weaker gravity throws further");
  // R = v² sin2θ / g, so the ratio of ranges is exactly the inverse ratio of the gravities.
  assert.ok(Math.abs(moon / earth - GRAVITY_OF("earth") / GRAVITY_OF("moon")) < 1e-9);
  assert.ok(Math.abs(projectile.optimalAngle(speed, 0, GRAVITY_OF("moon")) - 45) < 1e-9, "45° is optimal everywhere on level ground");
});

function GRAVITY_OF(body) {
  return projectile.GRAVITY_PRESETS[body].value;
}
