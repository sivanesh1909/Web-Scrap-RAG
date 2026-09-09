"use client";

import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  alpha: number;
  phase: number;
}

interface SynapsePulse {
  fromIndex: number;
  toIndex: number;
  progress: number;
  speed: number;
  color: string;
}

interface StarDust {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  twinkleSpeed: number;
}

export const ParticleUniverse: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    // Color palette: Cyan, Violet, Neon Blue, Emerald, Magenta
    const colors = ["#00f0ff", "#8b5cf6", "#38bdf8", "#10b981", "#c084fc", "#f43f5e"];

    // Initialize main synaptic network particles
    const particleCount = Math.min(100, Math.floor((width * height) / 14000));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const radius = Math.random() * 2.2 + 1;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        radius,
        baseRadius: radius,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.35,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Initialize ambient stardust particles
    const dustCount = Math.min(70, Math.floor((width * height) / 20000));
    const starDust: StarDust[] = [];
    for (let i = 0; i < dustCount; i++) {
      starDust.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.2 + 0.4,
        alpha: Math.random() * 0.6 + 0.1,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
      });
    }

    // Synapse energy pulses traveling along connections
    const pulses: SynapsePulse[] = [];

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;

      // 1. Draw Stardust Layer (Drifting & Twinkling)
      for (let s = 0; s < starDust.length; s++) {
        const star = starDust[s];
        star.y -= 0.15;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }
        const currentAlpha =
          star.alpha * (0.6 + 0.4 * Math.sin(frame * star.twinkleSpeed));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = currentAlpha;
        ctx.fill();
      }

      // 2. Draw Subtle Mouse Energy Well
      if (mouse.active) {
        const gradient = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          280
        );
        gradient.addColorStop(0, "rgba(0, 240, 255, 0.12)");
        gradient.addColorStop(0.4, "rgba(139, 92, 246, 0.06)");
        gradient.addColorStop(0.8, "rgba(16, 185, 129, 0.02)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Update & Draw Main Synaptic Network Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Organic slight sinusoidal drift
        p.x += p.vx + Math.sin(frame * 0.015 + p.phase) * 0.15;
        p.y += p.vy + Math.cos(frame * 0.015 + p.phase) * 0.15;

        // Wrap boundaries smoothly
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        // Mouse interaction: fluid vortex and repulsion
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 200) {
            const force = (200 - dist) / 200;
            p.x += (dx / dist) * force * 0.75;
            p.y += (dy / dist) * force * 0.75;
            p.radius = p.baseRadius * (1 + force * 2.0);
          } else {
            p.radius = p.baseRadius;
          }
        }

        // Draw particle core with glowing aura
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 14;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Connect nearby particles with synaptic lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const distx = p.x - p2.x;
          const disty = p.y - p2.y;
          const distance = Math.sqrt(distx * distx + disty * disty);

          if (distance < 140) {
            const lineAlpha = (1 - distance / 140) * 0.28;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = lineAlpha;
            ctx.lineWidth = 0.85;
            ctx.stroke();

            // Randomly spawn a synaptic energy pulse along this active line
            if (Math.random() < 0.0006 && pulses.length < 18) {
              pulses.push({
                fromIndex: i,
                toIndex: j,
                progress: 0,
                speed: 0.015 + Math.random() * 0.02,
                color: p.color,
              });
            }
          }
        }
      }

      // 4. Update and Render Synaptic Energy Pulses
      for (let pIdx = pulses.length - 1; pIdx >= 0; pIdx--) {
        const pulse = pulses[pIdx];
        pulse.progress += pulse.speed;

        if (pulse.progress >= 1.0) {
          pulses.splice(pIdx, 1);
          continue;
        }

        const pFrom = particles[pulse.fromIndex];
        const pTo = particles[pulse.toIndex];

        if (!pFrom || !pTo) {
          pulses.splice(pIdx, 1);
          continue;
        }

        const pulseX = pFrom.x + (pTo.x - pFrom.x) * pulse.progress;
        const pulseY = pFrom.y + (pTo.y - pFrom.y) * pulse.progress;

        ctx.beginPath();
        ctx.arc(pulseX, pulseY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 10;
        ctx.shadowColor = pulse.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1.0;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-85"
      style={{ willChange: "transform" }}
    />
  );
};

