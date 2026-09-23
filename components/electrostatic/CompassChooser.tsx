"use client";

import type { Compass } from "../../models/electrostatic-learning.ts";
import styles from "./ElectrostaticFieldLab.module.css";

const COMPASS_ARROW: Record<Compass, string> = {
  E: "→", NE: "↗", N: "↑", NW: "↖", W: "←", SW: "↙", S: "↓", SE: "↘", zero: "∅",
};
const COMPASS_WORD: Record<Compass, string> = {
  E: "向右", NE: "右上", N: "向上", NW: "左上", W: "向左", SW: "左下", S: "向下", SE: "右下", zero: "零場",
};
const COMPASS_AREA: Record<Compass, string> = {
  NW: "nw", N: "n", NE: "ne", W: "w", zero: "c", E: "e", SW: "sw", S: "s", SE: "se",
};

/**
 * A native radiogroup laid out spatially (NW/N/NE, W/·/E, SW/S/SE, with "zero" taking the centre
 * when present) instead of a rectangular list of choice rows. Real `<input type="radio">`s
 * sharing one `name` — arrow-key cycling and group semantics come from the browser for free.
 */
export default function CompassChooser(props: {
  readonly legend: string;
  readonly name: string;
  readonly directions: readonly Compass[];
  readonly value: Compass | null;
  readonly onChange: (value: Compass) => void;
}) {
  return (
    <fieldset className={styles.compassChooser}>
      <legend>{props.legend}</legend>
      <div className={styles.compassGrid} role="radiogroup" aria-label={props.legend}>
        {props.directions.map((compass) => (
          <label key={compass} className={styles.compassCell} style={{ gridArea: COMPASS_AREA[compass] }}>
            <input
              type="radio"
              name={props.name}
              value={compass}
              checked={props.value === compass}
              onChange={() => props.onChange(compass)}
              data-testid={`${props.name}-${compass}`}
            />
            <span className={styles.compassArrow} aria-hidden="true">{COMPASS_ARROW[compass]}</span>
            <span className={styles.compassWord}>{COMPASS_WORD[compass]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
