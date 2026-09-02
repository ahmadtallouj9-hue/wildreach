using System;
using System.Runtime.CompilerServices;

namespace VYTHERA.Core.Maths
{
    public delegate float Noise2D(float x, float y);
    public delegate float Noise3D(float x, float y, float z);

    /// <summary>
    /// Procedural simplex noise and fractal generator matching reference NoiseKit.ts.
    /// </summary>
    public sealed class SimplexNoise
    {
        private readonly byte[] _perm = new byte[512];
        private readonly byte[] _permMod12 = new byte[512];

        private static readonly float F2 = 0.5f * (MathF.Sqrt(3.0f) - 1.0f);
        private static readonly float G2 = (3.0f - MathF.Sqrt(3.0f)) / 6.0f;
        private static readonly float F3 = 1.0f / 3.0f;
        private static readonly float G3 = 1.0f / 6.0f;

        private static readonly int[] Grad3 = new int[]
        {
            1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
            1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
            0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
        };

        public SimplexNoise(ref Mulberry32 rng)
        {
            byte[] p = new byte[256];
            for (int i = 0; i < 256; i++) p[i] = (byte)i;

            // Fisher-Yates shuffle with mulberry32 (matching simplex-noise JS package)
            for (int i = 255; i > 0; i--)
            {
                int r = (int)MathF.Floor((float)rng.NextDouble() * (i + 1));
                byte tmp = p[i];
                p[i] = p[r];
                p[r] = tmp;
            }

            for (int i = 0; i < 512; i++)
            {
                _perm[i] = p[i & 255];
                _permMod12[i] = (byte)(_perm[i] % 12);
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float Sample2D(float xin, float yin)
        {
            float n0, n1, n2;
            float s = (xin + yin) * F2;
            int i = FastFloor(xin + s);
            int j = FastFloor(yin + s);
            float t = (i + j) * G2;
            float X0 = i - t;
            float Y0 = j - t;
            float x0 = xin - X0;
            float y0 = yin - Y0;

            int i1, j1;
            if (x0 > y0) { i1 = 1; j1 = 0; }
            else { i1 = 0; j1 = 1; }

            float x1 = x0 - i1 + G2;
            float y1 = y0 - j1 + G2;
            float x2 = x0 - 1.0f + 2.0f * G2;
            float y2 = y0 - 1.0f + 2.0f * G2;

            int ii = i & 255;
            int jj = j & 255;
            int gi0 = _permMod12[ii + _perm[jj]];
            int gi1 = _permMod12[ii + i1 + _perm[jj + j1]];
            int gi2 = _permMod12[ii + 1 + _perm[jj + 1]];

            float t0 = 0.5f - x0 * x0 - y0 * y0;
            if (t0 < 0) n0 = 0.0f;
            else
            {
                t0 *= t0;
                n0 = t0 * t0 * (Grad3[gi0 * 3] * x0 + Grad3[gi0 * 3 + 1] * y0);
            }

            float t1 = 0.5f - x1 * x1 - y1 * y1;
            if (t1 < 0) n1 = 0.0f;
            else
            {
                t1 *= t1;
                n1 = t1 * t1 * (Grad3[gi1 * 3] * x1 + Grad3[gi1 * 3 + 1] * y1);
            }

            float t2 = 0.5f - x2 * x2 - y2 * y2;
            if (t2 < 0) n2 = 0.0f;
            else
            {
                t2 *= t2;
                n2 = t2 * t2 * (Grad3[gi2 * 3] * x2 + Grad3[gi2 * 3 + 1] * y2);
            }

            return 70.0f * (n0 + n1 + n2);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float Sample3D(float xin, float yin, float zin)
        {
            float n0, n1, n2, n3;
            float s = (xin + yin + zin) * F3;
            int i = FastFloor(xin + s);
            int j = FastFloor(yin + s);
            int k = FastFloor(zin + s);
            float t = (i + j + k) * G3;
            float X0 = i - t;
            float Y0 = j - t;
            float Z0 = k - t;
            float x0 = xin - X0;
            float y0 = yin - Y0;
            float z0 = zin - Z0;

            int i1, j1, k1;
            int i2, j2, k2;
            if (x0 >= y0)
            {
                if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
                else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
                else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
            }
            else
            {
                if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
                else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
                else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            }

            float x1 = x0 - i1 + G3;
            float y1 = y0 - j1 + G3;
            float z1 = z0 - k1 + G3;
            float x2 = x0 - i2 + 2.0f * G3;
            float y2 = y0 - j2 + 2.0f * G3;
            float z2 = z0 - k2 + 2.0f * G3;
            float x3 = x0 - 1.0f + 3.0f * G3;
            float y3 = y0 - 1.0f + 3.0f * G3;
            float z3 = z0 - 1.0f + 3.0f * G3;

            int ii = i & 255;
            int jj = j & 255;
            int kk = k & 255;
            int gi0 = _permMod12[ii + _perm[jj + _perm[kk]]];
            int gi1 = _permMod12[ii + i1 + _perm[jj + j1 + _perm[kk + k1]]];
            int gi2 = _permMod12[ii + i2 + _perm[jj + j2 + _perm[kk + k2]]];
            int gi3 = _permMod12[ii + 1 + _perm[jj + 1 + _perm[kk + 1]]];

            float t0 = 0.6f - x0 * x0 - y0 * y0 - z0 * z0;
            if (t0 < 0) n0 = 0.0f;
            else { t0 *= t0; n0 = t0 * t0 * (Grad3[gi0 * 3] * x0 + Grad3[gi0 * 3 + 1] * y0 + Grad3[gi0 * 3 + 2] * z0); }

            float t1 = 0.6f - x1 * x1 - y1 * y1 - z1 * z1;
            if (t1 < 0) n1 = 0.0f;
            else { t1 *= t1; n1 = t1 * t1 * (Grad3[gi1 * 3] * x1 + Grad3[gi1 * 3 + 1] * y1 + Grad3[gi1 * 3 + 2] * z1); }

            float t2 = 0.6f - x2 * x2 - y2 * y2 - z2 * z2;
            if (t2 < 0) n2 = 0.0f;
            else { t2 *= t2; n2 = t2 * t2 * (Grad3[gi2 * 3] * x2 + Grad3[gi2 * 3 + 1] * y2 + Grad3[gi2 * 3 + 2] * z2); }

            float t3 = 0.6f - x3 * x3 - y3 * y3 - z3 * z3;
            if (t3 < 0) n3 = 0.0f;
            else { t3 *= t3; n3 = t3 * t3 * (Grad3[gi3 * 3] * x3 + Grad3[gi3 * 3 + 1] * y3 + Grad3[gi3 * 3 + 2] * z3); }

            return 32.0f * (n0 + n1 + n2 + n3);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int FastFloor(float x)
        {
            int xi = (int)x;
            return x < xi ? xi - 1 : xi;
        }
    }

    public static class NoiseKit
    {
        public static float Fbm2(SimplexNoise noise, float x, float z, int octaves, float lac = 2.05f, float gain = 0.5f)
        {
            float v = 0f;
            float a = 1f;
            float f = 1f;
            float n = 0f;
            for (int i = 0; i < octaves; i++)
            {
                v += a * noise.Sample2D(x * f, z * f);
                n += a;
                a *= gain;
                f *= lac;
            }
            return v / n;
        }

        public static float Ridged2(SimplexNoise noise, float x, float z, int octaves)
        {
            float v = 0f;
            float a = 1f;
            float f = 1f;
            float n = 0f;
            for (int i = 0; i < octaves; i++)
            {
                float r = 1f - MathF.Abs(noise.Sample2D(x * f, z * f));
                v += a * r * r;
                n += a;
                a *= 0.5f;
                f *= 2.1f;
            }
            return v / n;
        }

        public static float Fbm3(SimplexNoise noise, float x, float y, float z, int octaves)
        {
            float v = 0f;
            float a = 1f;
            float f = 1f;
            float n = 0f;
            for (int i = 0; i < octaves; i++)
            {
                v += a * noise.Sample3D(x * f, y * f, z * f);
                n += a;
                a *= 0.5f;
                f *= 2.02f;
            }
            return v / n;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float Smoothstep(float edge0, float edge1, float x)
        {
            float t = Math.Clamp((x - edge0) / (edge1 - edge0), 0f, 1f);
            return t * t * (3f - 2f * t);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float Lerp(float a, float b, float t)
        {
            return a + (b - a) * t;
        }
    }
}
