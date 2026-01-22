using System;
using System.Collections.Generic;
using System.Linq;

namespace VisualCode.Javaspectre.Axes
{
    public enum SpectralLabel
    {
        Unknown = 0,
        NonFiction = 1,
        Fiction = 2,
        SpeculativeScienceLinked = 3,
        Commercial = 4
    }

    /// <summary>
    /// Core embedding container: joint text+visual representation.
    /// x ∈ R^d, plus derived meta-features.
    /// </summary>
    public sealed class SpectralEmbedding
    {
        public float[] Vector { get; }
        public int Dim => Vector.Length;

        // Optional meta-features produced upstream (e.g., from a VL model).
        public float PhysicalPlausibility;  // A1: 0=impossible, 1=realistic [web:25]
        public float ScientificGrounding;   // A2: 0=no science context, 1=strong context [web:25][web:41]
        public float FranchiseEnergy;       // A3: 0=generic, 1=strong IP (GTA/He-Man/Star Trek etc.) [web:39]
        public float SensationalEnergy;     // A4: 0=sober, 1=hyper-sensational [web:39][web:42]
        public float CommercialPressure;    // A4': 0=neutral, 1=hard sell / ad creative

        public SpectralEmbedding(float[] vector)
        {
            if (vector == null || vector.Length == 0)
                throw new ArgumentException("Vector must be non-empty.");

            Vector = vector;
        }
    }

    /// <summary>
    /// Axis basis: e1..e4 as described in your query.
    /// Each axis is a direction in embedding space; they can be learned by linear probes
    /// or contrastive heads [web:25][web:30].
    /// </summary>
    public sealed class AxisBasis
    {
        // e1: Empirical support axis (data, instruments, citations) [web:25][web:41]
        public float[] EmpiricalAxis;   // e1
        // e2: Fictional universe axis (franchise IP, stylization) [web:39]
        public float[] FictionAxis;     // e2
        // e3: Speculation / drift axis (distance from consensus) [web:25]
        public float[] DriftAxis;       // e3
        // e4: Commercial / ads axis (marketing, promos) [web:25]
        public float[] CommercialAxis;  // e4

        public int Dim => EmpiricalAxis.Length;

        public AxisBasis(float[] e1, float[] e2, float[] e3, float[] e4)
        {
            if (e1 == null || e2 == null || e3 == null || e4 == null)
                throw new ArgumentException("All axis vectors must be non-null.");
            if (e1.Length == 0 || e2.Length == 0 || e3.Length == 0 || e4.Length == 0)
                throw new ArgumentException("All axis vectors must be non-empty.");
            if (!(e1.Length == e2.Length && e2.Length == e3.Length && e3.Length == e4.Length))
                throw new ArgumentException("All axis vectors must have same dimensionality.");

            EmpiricalAxis = Normalize(e1);
            FictionAxis = Normalize(e2);
            DriftAxis = Normalize(e3);
            CommercialAxis = Normalize(e4);
        }

        private static float[] Normalize(float[] v)
        {
            double norm = 0.0;
            for (int i = 0; i < v.Length; i++)
                norm += v[i] * v[i];
            norm = Math.Sqrt(norm);
            if (norm == 0) return v.ToArray();
            float[] result = new float[v.Length];
            for (int i = 0; i < v.Length; i++)
                result[i] = (float)(v[i] / norm);
            return result;
        }
    }

    /// <summary>
    /// Scalar coordinates c_i = e_i^T x for i ∈ {1..4}.
    /// Also stores post-move values for introspection.
    /// </summary>
    public sealed class AxisCoordinates
    {
        public float Empirical;   // c1
        public float Fiction;     // c2
        public float Drift;       // c3
        public float Commercial;  // c4

        public float EmpiricalAfterMoves;
        public float FictionAfterMoves;
        public float DriftAfterMoves;
        public float CommercialAfterMoves;

        public override string ToString()
        {
            return $"[Empirical={Empirical:F3}, Fiction={Fiction:F3}, Drift={Drift:F3}, Commercial={Commercial:F3}]";
        }
    }

    /// <summary>
    /// Result of a single Javaspectre introspective pass:
    /// - Label (fiction / non-fiction / speculative / commercial)
    /// - Scores sfact, sfiction, sspec analogous to your description
    /// - Axis coordinates before/after moves
    /// - Symbolic excavation path P(V) as a compact string
    /// </summary>
    public sealed class SpectralAxisResult
    {
        public SpectralLabel Label;
        public float SFact;
        public float SFiction;
        public float SSpec;
        public float SCommercial;

        public AxisCoordinates Coordinates = new AxisCoordinates();
        public float DriftDelta;
        public string ExcavationPath = string.Empty;

        // For user-facing visualization (radar sliders).
        public Dictionary<string, float> NormalizedAxes = new Dictionary<string, float>();

        public override string ToString()
        {
            return $"Label={Label}, S_fact={SFact:F3}, S_fiction={SFiction:F3}, S_spec={SSpec:F3}, S_comm={SCommercial:F3}, DriftΔ={DriftDelta:F3}, Path={ExcavationPath}";
        }
    }

    /// <summary>
    /// Main engine implementing the axis-aware fiction vs non-fiction calculation:
    /// - Maps V → x
    /// - Projects onto e1..e4
    /// - Applies introspective moves (source-projection, franchise-projection, drift-measure)
    /// - Outputs spectral scores suitable for routing and explanation [web:25][web:39][web:30].
    /// </summary>
    public sealed class SpectralAxisEngine
    {
        private readonly AxisBasis _basis;

        // Topic means for drift computation: μ_topic per topic key.
        private readonly Dictionary<string, float> _topicEmpiricalMeans;

        public SpectralAxisEngine(AxisBasis basis, Dictionary<string, float> topicMeans = null)
        {
            _basis = basis;
            _topicEmpiricalMeans = topicMeans ?? new Dictionary<string, float>();
        }

        /// <summary>
        /// Core public API:
        /// Given a virtual object embedding and optional topic ID,
        /// compute axis coordinates, introspective moves, and spectral label.
        /// </summary>
        public SpectralAxisResult Analyze(SpectralEmbedding emb, string topicId = "global")
        {
            if (emb.Dim != _basis.Dim)
                throw new ArgumentException("Embedding dimension does not match axis basis dimension.");

            // Step 1: base coordinates c_i = e_i^T x
            AxisCoordinates coords = ProjectToAxes(emb);

            // Step 2: compute spectral scores s_fact, s_fiction, s_spec, s_comm
            (float sFact, float sFiction, float sSpec, float sComm) = ComputeSpectralScores(emb, coords);

            // Step 3: introspective moves (M_src, M_fr, M_spec, M_comm, M_drift)
            List<string> moves = new List<string>();
            AxisCoordinates updated = ApplyIntrospectiveMoves(emb, coords, topicId, moves, out float driftDelta);

            // Step 4: final label
            SpectralLabel label = DecideLabel(sFact, sFiction, sSpec, sComm);

            SpectralAxisResult result = new SpectralAxisResult
            {
                Label = label,
                SFact = sFact,
                SFiction = sFiction,
                SSpec = sSpec,
                SCommercial = sComm,
                Coordinates = updated,
                DriftDelta = driftDelta,
                ExcavationPath = string.Join(" -> ", moves)
            };

            // Step 5: normalized axis values for radar/slider visualization
            result.NormalizedAxes["science_axis"] = Sigmoid(updated.EmpiricalAfterMoves);
            result.NormalizedAxes["fiction_axis"] = Sigmoid(updated.FictionAfterMoves);
            result.NormalizedAxes["speculation_axis"] = Sigmoid(updated.DriftAfterMoves);
            result.NormalizedAxes["commercial_axis"] = Sigmoid(updated.CommercialAfterMoves);

            return result;
        }

        private AxisCoordinates ProjectToAxes(SpectralEmbedding emb)
        {
            float c1 = Dot(emb.Vector, _basis.EmpiricalAxis);
            float c2 = Dot(emb.Vector, _basis.FictionAxis);
            float c3 = Dot(emb.Vector, _basis.DriftAxis);
            float c4 = Dot(emb.Vector, _basis.CommercialAxis);

            return new AxisCoordinates
            {
                Empirical = c1,
                Fiction = c2,
                Drift = c3,
                Commercial = c4,
                EmpiricalAfterMoves = c1,
                FictionAfterMoves = c2,
                DriftAfterMoves = c3,
                CommercialAfterMoves = c4
            };
        }

        private static float Dot(float[] x, float[] y)
        {
            double sum = 0.0;
            for (int i = 0; i < x.Length; i++)
                sum += x[i] * y[i];
            return (float)sum;
        }

        /// <summary>
        /// Compute spectral scores using both axis coordinates and meta-features.
        /// Mirrors sfact, sfiction, sspec logic in your description [web:25][web:30][web:39].
        /// </summary>
        private (float, float, float, float) ComputeSpectralScores(SpectralEmbedding emb, AxisCoordinates coords)
        {
            float c1 = coords.Empirical;
            float c2 = coords.Fiction;
            float c3 = coords.Drift;
            float c4 = coords.Commercial;

            // s_fact: prefer high empirical, low drift, low franchise, low sensational/commerce.
            double sFact = 0.0;
            sFact += 0.45 * Sigmoid(c1);                    // empirical axis [web:25]
            sFact += 0.20 * (1.0 - Sigmoid(c2));            // anti-franchise [web:39]
            sFact += 0.15 * (1.0 - Sigmoid(c3));            // anti-drift [web:25]
            sFact += 0.10 * (1.0 - Sigmoid(emb.SensationalEnergy)); // sober language [web:42]
            sFact += 0.10 * (1.0 - Sigmoid(c4));            // not strongly commercial

            // s_fiction: prefer high franchise, high sensational, low empirical.
            double sFiction = 0.0;
            sFiction += 0.40 * Sigmoid(c2);                 // franchise axis [web:39]
            sFiction += 0.30 * Sigmoid(emb.SensationalEnergy);
            sFiction += 0.20 * (1.0 - Sigmoid(c1));         // low empirical
            sFiction += 0.10 * Sigmoid(emb.FranchiseEnergy);

            // s_spec: prefer mid empirical, high drift, some sensational.
            double sSpec = 0.0;
            sSpec += 0.35 * Sigmoid(c3);                    // drift axis [web:25]
            sSpec += 0.25 * Sigmoid(emb.SensationalEnergy);
            sSpec += 0.20 * Sigmoid(emb.ScientificGrounding);
            sSpec += 0.20 * Sigmoid(c1) * (1.0 - Sigmoid(c2)); // real science, not strong franchise

            // s_comm: prefer high commercial axis and pressure.
            double sComm = 0.0;
            sComm += 0.55 * Sigmoid(c4);
            sComm += 0.45 * Sigmoid(emb.CommercialPressure);

            return ((float)sFact, (float)sFiction, (float)sSpec, (float)sComm);
        }

        /// <summary>
        /// Introspective moves M_src, M_fr, M_spec, M_comm, M_drift in axis-space,
        /// as described in your notation [web:25].
        /// </summary>
        private AxisCoordinates ApplyIntrospectiveMoves(
            SpectralEmbedding emb,
            AxisCoordinates coords,
            string topicId,
            List<string> moves,
            out float driftDelta)
        {
            AxisCoordinates updated = new AxisCoordinates
            {
                Empirical = coords.Empirical,
                Fiction = coords.Fiction,
                Drift = coords.Drift,
                Commercial = coords.Commercial,
                EmpiricalAfterMoves = coords.Empirical,
                FictionAfterMoves = coords.Fiction,
                DriftAfterMoves = coords.Drift,
                CommercialAfterMoves = coords.Commercial
            };

            // M_src: source-projection move: increase empirical weight if scientific grounding high [web:25][web:41]
            if (emb.ScientificGrounding > 0.4f || emb.PhysicalPlausibility > 0.5f)
            {
                float alpha = 0.3f * emb.ScientificGrounding;
                updated.EmpiricalAfterMoves += alpha;
                moves.Add("M_src(+e1)");
            }

            // M_fr: franchise-projection move: increase fiction energy if franchise cues high [web:39]
            if (emb.FranchiseEnergy > 0.4f)
            {
                float beta = 0.4f * emb.FranchiseEnergy;
                updated.FictionAfterMoves += beta;
                moves.Add("M_fr(+e2)");
            }

            // M_spec: emphasize drift for highly sensational, low-evidence cases [web:39][web:42]
            if (emb.SensationalEnergy > 0.5f && emb.ScientificGrounding < 0.4f)
            {
                float gamma = 0.35f * emb.SensationalEnergy;
                updated.DriftAfterMoves += gamma;
                moves.Add("M_spec(+e3)");
            }

            // M_comm: commercial projection for strong ads [web:25]
            if (emb.CommercialPressure > 0.5f)
            {
                float eta = 0.5f * emb.CommercialPressure;
                updated.CommercialAfterMoves += eta;
                moves.Add("M_comm(+e4)");
            }

            // M_drift: drift measurement move δ = |e3^T x - μ_topic|
            float muTopic = 0.0f;
            if (!_topicEmpiricalMeans.TryGetValue(topicId, out muTopic))
                muTopic = 0.0f;

            float before = coords.Drift;
            float after = updated.DriftAfterMoves;
            float deltaBefore = Math.Abs(before - muTopic);
            float deltaAfter = Math.Abs(after - muTopic);
            driftDelta = deltaAfter - deltaBefore; // positive = moved further from consensus.

            moves.Add("M_drift(δ)");

            return updated;
        }

        private SpectralLabel DecideLabel(float sFact, float sFiction, float sSpec, float sComm)
        {
            // Priority ordering:
            // 1) Commercial if sComm very high and sFact low (ads).
            if (sComm > 0.75f && sFact < 0.5f)
                return SpectralLabel.Commercial;

            // 2) Clear non-fiction vs fiction vs speculative.
            float maxScore = Math.Max(Math.Max(sFact, sFiction), sSpec);

            if (maxScore == sFact && sFact >= 0.55f)
                return SpectralLabel.NonFiction;

            if (maxScore == sFiction && sFiction >= 0.55f)
                return SpectralLabel.Fiction;

            if (maxScore == sSpec && sSpec >= 0.45f)
                return SpectralLabel.SpeculativeScienceLinked;

            // 3) Fallback: choose max.
            if (maxScore == sFact) return SpectralLabel.NonFiction;
            if (maxScore == sFiction) return SpectralLabel.Fiction;
            if (maxScore == sSpec) return SpectralLabel.SpeculativeScienceLinked;

            return SpectralLabel.Unknown;
        }

        private static float Sigmoid(float v)
        {
            double x = Math.Max(-12.0, Math.Min(12.0, v));
            return (float)(1.0 / (1.0 + Math.Exp(-x)));
        }
    }
}
