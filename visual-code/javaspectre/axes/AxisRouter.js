export class AxisRouter {
  constructor(options = {}) {
    this.fastThreshold = options.fastThreshold || 0.7;        // s_fact
    this.conservativeSpecThreshold = options.conservativeSpecThreshold || 0.45; // s_spec
    this.maxFictionForScience = options.maxFictionForScience || 0.4;
  }

  /**
   * Decide routing policy for a single content item based on axis result.
   * Returns:
   *  - mode: "fast", "conservative", "entertainment-only", "ads"
   *  - explain: short structured explanation for UI.
   */
  decideRoute(axisResult) {
    const { Label, SFact, SFiction, SSpec, SCommercial, NormalizedAxes } = axisResult;

    if (Label === 4 || SCommercial > 0.75) {
      return {
        mode: "ads",
        explain: this._explain(axisResult, "Commercial/ads: scientific reasoning not applied.")
      };
    }

    if (Label === 2 || SFiction > 0.65) {
      return {
        mode: "entertainment-only",
        explain: this._explain(axisResult, "Fiction/entertainment context only; no scientific inference.")
      };
    }

    if (SFact >= this.fastThreshold && SFiction <= this.maxFictionForScience && SSpec < this.conservativeSpecThreshold) {
      return {
        mode: "fast",
        explain: this._explain(axisResult, "High empirical support; fast science pipeline.")
      };
    }

    if (SSpec >= this.conservativeSpecThreshold) {
      return {
        mode: "conservative",
        explain: this._explain(axisResult, "Speculative or drifted; conservative, verification-heavy pipeline.")
      };
    }

    return {
      mode: "conservative",
      explain: this._explain(axisResult, "Mixed signals; defaulting to conservative pipeline.")
    };
  }

  _explain(axisResult, prefix) {
    const ax = axisResult.NormalizedAxes || {};
    const sci = (ax["science_axis"] || 0).toFixed(2);
    const fic = (ax["fiction_axis"] || 0).toFixed(2);
    const spec = (ax["speculation_axis"] || 0).toFixed(2);
    const comm = (ax["commercial_axis"] || 0).toFixed(2);

    return `${prefix} Axes → Science: ${sci}, Fiction: ${fic}, Speculation: ${spec}, Commercial: ${comm}.`;
  }

  /**
   * Example integration hook: query backend axis engine.
   */
  async analyzeAndRoute(virtualObjectId, embeddingPayload) {
    const res = await fetch("/axis/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: virtualObjectId,
        embedding: embeddingPayload
      })
    });

    if (!res.ok) {
      throw new Error(`Axis analysis failed with status ${res.status}`);
    }

    const axisResult = await res.json();
    const routing = this.decideRoute(axisResult);
    return { axisResult, routing };
  }
}
