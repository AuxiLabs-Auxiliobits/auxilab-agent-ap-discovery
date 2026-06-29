import React, {
  Suspense,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";

/*
 * Avatar3D — cute 3D anime girl avatar ("Aria") for AP Discovery Live.
 *
 * Uses VRM (@pixiv/three-vrm). Real-time animation:
 *   - LIP SYNC: mouth ("aa") opens with Aria's live voice amplitude (analyserRef).
 *   - AUTO BLINK + gentle idle head sway.
 *   - EMOTION EXPRESSIONS: the `emotion` prop (driven by LiveChat's text analysis)
 *     maps to VRM expressions (happy / sad / surprised / relaxed) with smooth
 *     interpolation and emotion-specific head gestures.
 *
 * IMPORTANT — why expressions are now reliable:
 *   VRM models name their expressions differently (VRM1 presets like "happy",
 *   VRM0 legacy like "joy", or capitalized/custom VRoid names). On load we read
 *   the model's ACTUAL expression list and resolve each logical emotion to a
 *   name the model really has. We also log the available names to the console
 *   so you can see exactly what your avatar supports.
 *
 * DEBUG / DEMO:
 *   Set VITE_AVATAR_EMOTION_DEMO=1 in frontend/.env to cycle through every
 *   emotion automatically (great for verifying expressions work). Open the
 *   browser console to see "[Avatar3D] expressions available: [...]".
 *
 * MODEL SOURCE (load order):
 *   1. VITE_AVATAR_URL  (optional .vrm URL)
 *   2. /avatars/aria.vrm  (local file in frontend/public/avatars/)
 */

const ENV_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_AVATAR_URL) ||
  "";
const AVATAR_URL = ENV_URL || "/avatars/aria.vrm";

const DEMO_MODE =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  (import.meta.env.VITE_AVATAR_EMOTION_DEMO === "1" ||
    import.meta.env.VITE_AVATAR_EMOTION_DEMO === "true");
const DEMO_CYCLE = ["neutral", "happy", "surprised", "empathetic", "thinking"];

const GL_PROPS = {
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
};
const CAMERA_PROPS = {
  fov: 30,
  position: [0, 1.38, 0.9],
  near: 0.01,
  far: 100,
};
const CANVAS_STYLE = { width: "100%", height: "100%" };

/* ═══════════════════════════════════════════════════════════════════════════
   EMOTION PRESETS — VRM expression weights + head-gesture params (per emotion)
   Values are intentionally STRONG so the change is clearly visible.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMOTION_PRESETS = {
  neutral: {
    happy: 0.1,
    sad: 0,
    surprised: 0,
    angry: 0,
    relaxed: 0.12,
    swayAmp: 0.06,
    swaySpd: 0.5,
    nodAmp: 0.02,
    nodSpd: 0.9,
    tiltZ: 0,
  },
  happy: {
    happy: 0.95,
    sad: 0,
    surprised: 0,
    angry: 0,
    relaxed: 0,
    swayAmp: 0.1,
    swaySpd: 0.8,
    nodAmp: 0.04,
    nodSpd: 1.4,
    tiltZ: 0.05,
  },
  empathetic: {
    happy: 0,
    sad: 0.55,
    surprised: 0,
    angry: 0,
    relaxed: 0.2,
    swayAmp: 0.04,
    swaySpd: 0.35,
    nodAmp: 0.05,
    nodSpd: 1.7,
    tiltZ: 0.08,
  },
  surprised: {
    happy: 0.15,
    sad: 0,
    surprised: 0.9,
    angry: 0,
    relaxed: 0,
    swayAmp: 0.02,
    swaySpd: 0.3,
    nodAmp: 0.01,
    nodSpd: 0.5,
    tiltZ: -0.05,
  },
  thinking: {
    happy: 0.05,
    sad: 0,
    surprised: 0.1,
    angry: 0,
    relaxed: 0.55,
    swayAmp: 0.03,
    swaySpd: 0.25,
    nodAmp: 0.015,
    nodSpd: 0.6,
    tiltZ: 0.1,
  },
};

const EXPR_KEYS = ["happy", "sad", "surprised", "angry", "relaxed"];
const HEAD_KEYS = ["swayAmp", "swaySpd", "nodAmp", "nodSpd", "tiltZ"];

/* Logical expression -> candidate names across VRM1 / VRM0 / capitalized variants.
   We pick whichever the loaded model actually has. */
const EXPR_ALIASES = {
  happy: ["happy", "Happy", "joy", "Joy", "fun", "Fun"],
  sad: ["sad", "Sad", "sorrow", "Sorrow"],
  angry: ["angry", "Angry"],
  surprised: ["surprised", "Surprised"],
  relaxed: ["relaxed", "Relaxed", "fun", "Fun"],
  blink: ["blink", "Blink"],
  aa: ["aa", "a", "A"],
  oh: ["oh", "o", "O"],
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function readAmplitude(analyser, dataArray) {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(dataArray);
  let sumSq = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / dataArray.length);
}

// Read the expression names a VRM actually exposes.
function getExpressionNames(em) {
  if (!em) return [];
  try {
    if (Array.isArray(em.expressions)) {
      return em.expressions
        .map((e) => e && (e.expressionName || e.name))
        .filter(Boolean);
    }
  } catch (e) {
    /* noop */
  }
  if (em.expressionMap) return Object.keys(em.expressionMap);
  return [];
}

// Map each logical emotion to a name the model really has.
function buildResolvedMap(names) {
  const lower = {};
  names.forEach((n) => {
    lower[String(n).toLowerCase()] = n;
  });
  const resolved = {};
  for (const logical of Object.keys(EXPR_ALIASES)) {
    for (const cand of EXPR_ALIASES[logical]) {
      const hit = lower[cand.toLowerCase()];
      if (hit) {
        resolved[logical] = hit;
        break;
      }
    }
  }
  return resolved;
}

function applyExpr(em, resolved, logical, weight) {
  const name = resolved[logical];
  if (!name) return;
  em.setValue(name, Math.max(0, Math.min(1, weight)));
}

function useAnimationState() {
  return useRef({
    data: new Uint8Array(128),
    jaw: 0,
    blink: { countdown: 1.5, t: 0, closing: false, value: 0 },
    expr: { ...EMOTION_PRESETS.neutral },
    micro: { countdown: 5, key: null, t: 0 },
    wave: 0,
  });
}

function stepBlink(blink, delta) {
  blink.countdown -= delta;
  if (blink.countdown <= 0 && !blink.closing) {
    blink.closing = true;
    blink.t = 0;
  }
  if (blink.closing) {
    blink.t += delta;
    const dur = 0.14;
    const half = dur / 2;
    blink.value =
      blink.t < half
        ? blink.t / half
        : Math.max(0, 1 - (blink.t - half) / half);
    if (blink.t >= dur) {
      blink.closing = false;
      blink.value = 0;
      blink.countdown = 2 + Math.random() * 3;
    }
  }
  return blink.value;
}

function lerpTo(current, target, delta, speed) {
  return current + (target - current) * Math.min(1, delta * speed);
}

/* ──────────────────────────────────────────────────��────────────────────────
   ARM AUTO-CALIBRATION

   VRM rigs disagree on which local axis/sign raises, lowers, folds or rocks an
   arm (VRM0 vs VRM1, rotateVRM0, VRoid quirks), so hard-coded signs only work
   for some models. Instead we probe the live rig: nudge a joint on each axis,
   measure where the hand actually ends up, and keep the axis+sign that moves it
   the way we want. This makes both the rest pose and the wave correct on every
   model.
   ─────────────────────────────────────────────────────────────────────────── */

const _calVec = new THREE.Vector3();
const _calVec0 = new THREE.Vector3();

// Scratch objects reused by the live (world-space) wave swing.
const _swingQuat = new THREE.Quaternion();
const _swingAxis = new THREE.Vector3();
const _swingParentQuat = new THREE.Quaternion();
const _elbowPos = new THREE.Vector3();
const _handPos = new THREE.Vector3();
const _forearm = new THREE.Vector3();

// useLoader CACHES the GLTF, handing back the SAME vrm on every reopen. These
// track per-model state so each model is oriented and calibrated exactly ONCE,
// then reproduced identically on subsequent opens.
const _rotatedVRMs = new WeakSet();
const _vrmCalCache = new WeakMap();

// Probe a joint's 3 local axes (±testAngle) and return the {axis, sign} whose
// resulting world position of `probe` maximizes scoreFn(pos, basePos). Always
// restores the joint to its starting rotation before returning.
function calibrateJointAxis(
  joint,
  probe,
  scene,
  testAngle,
  scoreFn,
  excludeAxis,
) {
  const base = { x: joint.rotation.x, y: joint.rotation.y, z: joint.rotation.z };
  scene.updateMatrixWorld(true);
  probe.getWorldPosition(_calVec0);
  const base0 = _calVec0.clone();
  let best = null;
  for (const axis of ["x", "y", "z"]) {
    if (axis === excludeAxis) continue;
    for (const sign of [1, -1]) {
      joint.rotation.set(base.x, base.y, base.z);
      joint.rotation[axis] += sign * testAngle;
      scene.updateMatrixWorld(true);
      probe.getWorldPosition(_calVec);
      const score = scoreFn(_calVec, base0);
      if (!best || score > best.score) best = { axis, sign, score };
    }
  }
  joint.rotation.set(base.x, base.y, base.z);
  scene.updateMatrixWorld(true);
  return best || { axis: "z", sign: 1, score: 0 };
}

// Lower one arm to a natural "down at the side" rest, whichever way this rig
// happens to rotate (so a mirrored/asymmetric rig can't leave an arm in midair).
function calibrateArmDown(humanoid, upperName, handName, lowerName, scene, angle) {
  const up = humanoid.getNormalizedBoneNode(upperName);
  const hand =
    humanoid.getNormalizedBoneNode(handName) ||
    humanoid.getNormalizedBoneNode(lowerName);
  if (!up || !hand) return;
  // Pick the rotation that drops the hand lowest (smallest world Y).
  const down = calibrateJointAxis(up, hand, scene, angle, (p) => -p.y);
  up.rotation[down.axis] += down.sign * angle;
  scene.updateMatrixWorld(true);
}

// Zero the arm bones to a clean baseline. The VRM is cached/reused, so its
// bones still hold the previous session's pose; the calibration below is
// additive, so we MUST start from zero or it stacks and drifts every reopen.
function resetArmPose(humanoid) {
  const names = [
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
  ];
  for (const n of names) {
    const b = humanoid.getNormalizedBoneNode(n);
    if (b) b.rotation.set(0, 0, 0);
  }
}

function eulerOf(bone) {
  return bone
    ? { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z }
    : { x: 0, y: 0, z: 0 };
}

// Snapshot both arms' resting rotations so the exact pose can be reproduced.
function captureArmRest(humanoid) {
  return {
    leftUpper: eulerOf(humanoid.getNormalizedBoneNode("leftUpperArm")),
    leftLower: eulerOf(humanoid.getNormalizedBoneNode("leftLowerArm")),
    leftHand: eulerOf(humanoid.getNormalizedBoneNode("leftHand")),
    rightUpper: eulerOf(humanoid.getNormalizedBoneNode("rightUpperArm")),
    rightLower: eulerOf(humanoid.getNormalizedBoneNode("rightLowerArm")),
    rightHand: eulerOf(humanoid.getNormalizedBoneNode("rightHand")),
  };
}

// Re-apply a captured rest snapshot (used on every reopen for a stable pose).
function applyArmRest(humanoid, rest) {
  const set = (name, e) => {
    const b = humanoid.getNormalizedBoneNode(name);
    if (b && e) b.rotation.set(e.x, e.y, e.z);
  };
  set("leftUpperArm", rest.leftUpper);
  set("leftLowerArm", rest.leftLower);
  set("leftHand", rest.leftHand);
  set("rightUpperArm", rest.rightUpper);
  set("rightLowerArm", rest.rightLower);
  set("rightHand", rest.rightHand);
}

// Work out how to wave the right arm on THIS rig and capture its rest pose.
function calibrateWave(humanoid, scene) {
  const rUp = humanoid.getNormalizedBoneNode("rightUpperArm");
  const rLow = humanoid.getNormalizedBoneNode("rightLowerArm");
  const rHand = humanoid.getNormalizedBoneNode("rightHand") || rLow;
  if (!rUp || !rLow) return null;

  const restUp = { x: rUp.rotation.x, y: rUp.rotation.y, z: rUp.rotation.z };
  const restLow = { x: rLow.rotation.x, y: rLow.rotation.y, z: rLow.rotation.z };
  const restHand = {
    x: rHand.rotation.x,
    y: rHand.rotation.y,
    z: rHand.rotation.z,
  };

  // 1. Upper arm: which rotation lifts the hand up AND toward the camera
  // (+z = front)? The forward bias stops rigs that would otherwise raise the
  // arm up behind the back — we want it up in front of / beside the head.
  const lift = calibrateJointAxis(rUp, rHand, scene, 1.0, (p) => p.y + 0.4 * p.z);
  rUp.rotation[lift.axis] += lift.sign * 1.4;
  scene.updateMatrixWorld(true);

  // 2. Elbow: which rotation folds the forearm up AND forward, bringing the
  // hand up toward the head in front of the body rather than behind it?
  const fold = calibrateJointAxis(rLow, rHand, scene, 1.0, (p) => p.y + 0.4 * p.z);
  rLow.rotation[fold.axis] += fold.sign * 1.4;
  scene.updateMatrixWorld(true);

  // (The side-to-side swing axis is NOT chosen here. Local bone axes vary too
  // much between rigs, so the live wave derives the swing direction from the
  // actual elbow->hand geometry each frame instead — see the wave block.)

  // Restore the rest pose; the live wave re-applies offsets each frame.
  rUp.rotation.set(restUp.x, restUp.y, restUp.z);
  rLow.rotation.set(restLow.x, restLow.y, restLow.z);
  rHand.rotation.set(restHand.x, restHand.y, restHand.z);
  scene.updateMatrixWorld(true);

  return {
    liftAxis: lift.axis,
    liftSign: lift.sign,
    foldAxis: fold.axis,
    foldSign: fold.sign,
    restUp,
    restLow,
    restHand,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VRM AVATAR
   ═══════════════════════════════════════════════════════════════════════════ */

function VRMAvatar({
  url,
  analyserRef,
  speakingRef,
  emotion = "neutral",
  waving = false,
  onReady,
}) {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = gltf.userData && gltf.userData.vrm;
  const { camera } = useThree();
  const st = useAnimationState();
  const headBaseX = useRef(null);
  const resolvedRef = useRef({});
  // Per-model wave calibration: which local axes/signs raise, fold and rock
  // the right arm, plus the captured rest pose. Filled on load by measuring
  // the actual rig instead of assuming a fixed VRM0/VRM1 axis convention.
  const waveCalRef = useRef(null);
  // "Ready" gating: never show the model before it's posed AND framed, or the
  // first frame(s) flash the full body (legs) at the default camera.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const framedRef = useRef(false); // camera framed + pose calibrated
  const revealFramesRef = useRef(0); // correct frames rendered since framing
  const readyRef = useRef(false); // fully revealed

  // Hide the model BEFORE the first paint so the un-posed T-pose at the default
  // camera never flashes. It's revealed from useFrame once framed + posed.
  useLayoutEffect(() => {
    if (vrm && !readyRef.current) vrm.scene.visible = false;
  }, [vrm]);

  useEffect(() => {
    if (!vrm) return undefined;
    // Orient VRM0 models to face forward — but only ONCE per cached model.
    // useLoader returns the same VRM on reopen; rotating again would spin it
    // 180° each time and move the whole pose.
    if (!_rotatedVRMs.has(vrm)) {
      try {
        VRMUtils.rotateVRM0(vrm);
      } catch (e) {
        /* VRM1 doesn't need it */
      }
      _rotatedVRMs.add(vrm);
    }
    vrm.scene.traverse((o) => {
      o.frustumCulled = false;
    });

    // Resolve expression names against what THIS model actually supports.
    const em = vrm.expressionManager;
    const names = getExpressionNames(em);
    resolvedRef.current = buildResolvedMap(names);
    // eslint-disable-next-line no-console
    console.log(
      "[Avatar3D] expressions available:",
      names,
      "\n[Avatar3D] resolved emotion map:",
      resolvedRef.current,
    );
    if (!resolvedRef.current.happy && !resolvedRef.current.sad) {
      // eslint-disable-next-line no-console
      console.warn(
        "[Avatar3D] This VRM exposes no standard emotion expressions " +
          "(happy/sad/etc). Facial emotions will be limited; head gestures " +
          "still work. Try a VRoid Studio / VRoid Hub model.",
      );
    }

    // Relax the T-pose into a natural rest, then learn how to wave this rig.
    const humanoid = vrm.humanoid;
    if (humanoid) {
      const scene = vrm.scene;
      // useLoader CACHES the GLTF and returns this same VRM on every reopen.
      // Re-probing a reused (already-animated) rig drifts, so we calibrate ONCE
      // per model, cache the result, and on later opens simply re-apply the
      // saved rest pose. Result: the arm/hand pose is identical on every open.
      let cal = _vrmCalCache.get(vrm);
      if (!cal) {
        // Clean baseline first so the additive calibration can't stack.
        if (typeof humanoid.resetNormalizedPose === "function") {
          humanoid.resetNormalizedPose();
        }
        resetArmPose(humanoid);
        scene.updateMatrixWorld(true);
        // Lower each arm INDEPENDENTLY so a mirrored/asymmetric rig can't leave
        // one arm stuck out in the air after the intro.
        calibrateArmDown(
          humanoid,
          "leftUpperArm",
          "leftHand",
          "leftLowerArm",
          scene,
          1.2,
        );
        calibrateArmDown(
          humanoid,
          "rightUpperArm",
          "rightHand",
          "rightLowerArm",
          scene,
          1.2,
        );
        // Learn the right arm's wave axes from its (now lowered) rest pose.
        cal = calibrateWave(humanoid, scene);
        cal.rest = captureArmRest(humanoid);
        _vrmCalCache.set(vrm, cal);
      } else {
        // Reopen: reproduce the cached rest pose exactly — no re-measuring.
        if (typeof humanoid.resetNormalizedPose === "function") {
          humanoid.resetNormalizedPose();
        }
        applyArmRest(humanoid, cal.rest);
        scene.updateMatrixWorld(true);
      }
      waveCalRef.current = cal;
    }

    // Frame the head / upper body like a video call.
    const target = new THREE.Vector3(0, 1.32, 0);
    const head = vrm.humanoid && vrm.humanoid.getNormalizedBoneNode("head");
    if (head) head.getWorldPosition(target);
    camera.position.set(target.x, target.y + 0.04, target.z + 0.9);
    camera.near = 0.01;
    camera.far = 100;
    camera.lookAt(target.x, target.y + 0.02, target.z);
    camera.updateProjectionMatrix();
    // Calibrated + framed. The next couple of rendered frames will be correct,
    // after which useFrame reveals the avatar and fires onReady.
    framedRef.current = true;
    revealFramesRef.current = 0;
    // NOTE: do NOT deepDispose the VRM here. useLoader caches the GLTF and
    // returns this very same object on the next open, so disposing it would
    // corrupt the cached instance — which was making the arm pose change on
    // every reopen.
    return undefined;
  }, [vrm, camera]);

  useFrame((state, delta) => {
    if (!vrm) return;
    const s = st.current;
    const t = state.clock.elapsedTime;
    const analyser = analyserRef && analyserRef.current;
    if (
      analyser &&
      analyser.frequencyBinCount &&
      analyser.frequencyBinCount !== s.data.length
    ) {
      s.data = new Uint8Array(analyser.frequencyBinCount);
    }
    const speaking = !!(speakingRef && speakingRef.current);

    // Resolve which emotion to show this frame.
    let activeEmotion = emotion;
    if (DEMO_MODE) {
      activeEmotion = DEMO_CYCLE[Math.floor(t / 2.5) % DEMO_CYCLE.length];
    }

    /* 1. Lip sync -> "aa" */
    let amp = 0;
    if (speaking && analyser) {
      amp = Math.min(1, readAmplitude(analyser, s.data) * 3.4);
    } else if (speaking) {
      amp = 0.25 + 0.2 * Math.abs(Math.sin(t * 9));
    }
    const targetJaw = speaking ? amp : 0;
    s.jaw += (targetJaw - s.jaw) * Math.min(1, delta * 18);

    /* 2. Blink */
    const blinkVal = stepBlink(s.blink, delta);

    /* 3. Idle micro-expression (keeps the face alive when neutral & quiet) */
    let microHappy = 0;
    let microSurprised = 0;
    if (!speaking && activeEmotion === "neutral") {
      s.micro.countdown -= delta;
      if (s.micro.countdown <= 0 && !s.micro.key) {
        s.micro.key = Math.random() < 0.7 ? "happy" : "surprised";
        s.micro.t = 0;
      }
      if (s.micro.key) {
        s.micro.t += delta;
        const dur = 1.4;
        const env = Math.sin((Math.min(s.micro.t, dur) / dur) * Math.PI); // 0..1..0
        if (s.micro.key === "happy") microHappy = env * 0.45;
        else microSurprised = env * 0.4;
        if (s.micro.t >= dur) {
          s.micro.key = null;
          s.micro.countdown = 5 + Math.random() * 6;
        }
      }
    } else {
      s.micro.key = null;
      s.micro.countdown = 4 + Math.random() * 4;
    }

    /* 4. Lerp emotion + head params toward the active preset */
    const preset = EMOTION_PRESETS[activeEmotion] || EMOTION_PRESETS.neutral;
    const LERP_SPEED = 4.0;
    for (const key of EXPR_KEYS) {
      s.expr[key] = lerpTo(s.expr[key] || 0, preset[key], delta, LERP_SPEED);
    }
    for (const key of HEAD_KEYS) {
      s.expr[key] = lerpTo(s.expr[key] || 0, preset[key], delta, LERP_SPEED);
    }

    // A subtle "talking smile" baseline so she looks warm while speaking.
    const speakingSmile = speaking ? 0.22 : 0;

    /* 5. Apply to VRM (using model-resolved names) */
    const em = vrm.expressionManager;
    const resolved = resolvedRef.current;
    if (em) {
      applyExpr(em, resolved, "aa", Math.min(1, s.jaw));
      applyExpr(em, resolved, "oh", Math.min(0.4, s.jaw * 0.4));
      applyExpr(em, resolved, "blink", blinkVal);
      applyExpr(
        em,
        resolved,
        "happy",
        Math.max(s.expr.happy, microHappy, speakingSmile),
      );
      applyExpr(em, resolved, "sad", s.expr.sad);
      applyExpr(
        em,
        resolved,
        "surprised",
        Math.max(s.expr.surprised, microSurprised),
      );
      applyExpr(em, resolved, "angry", s.expr.angry);
      applyExpr(em, resolved, "relaxed", s.expr.relaxed);
    }

    /* 6. Emotion-driven head gestures */
    const head = vrm.humanoid && vrm.humanoid.getNormalizedBoneNode("head");
    if (head) {
      if (headBaseX.current === null) headBaseX.current = head.rotation.x;
      head.rotation.y = Math.sin(t * s.expr.swaySpd) * s.expr.swayAmp;
      head.rotation.x =
        headBaseX.current +
        Math.sin(t * s.expr.nodSpd) * s.expr.nodAmp +
        s.jaw * 0.04;
      head.rotation.z = lerpTo(head.rotation.z || 0, s.expr.tiltZ, delta, 2.5);
    }

    /* 7. Greeting hand wave (only active while `waving` is true) */
    {
      const cal = waveCalRef.current;
      const hum = vrm.humanoid;
      const rUp = hum && hum.getNormalizedBoneNode("rightUpperArm");
      const rLow = hum && hum.getNormalizedBoneNode("rightLowerArm");
      const rHand = hum && hum.getNormalizedBoneNode("rightHand");
      if (cal && rUp && rLow) {
        s.wave = lerpTo(s.wave || 0, waving ? 1 : 0, delta, 6);
        const w = s.wave;
        // Always start from the captured rest pose, then add the wave on top.
        // Because we reset every frame, the arm returns fully to rest the
        // instant the wave ends — no more arm left hanging in the air.
        rUp.rotation.set(cal.restUp.x, cal.restUp.y, cal.restUp.z);
        rLow.rotation.set(cal.restLow.x, cal.restLow.y, cal.restLow.z);
        if (rHand) {
          rHand.rotation.set(cal.restHand.x, cal.restHand.y, cal.restHand.z);
        }
        if (w > 0.001) {
          // Raise the upper arm so the hand comes up beside the head.
          rUp.rotation[cal.liftAxis] += w * cal.liftSign * 1.4;
          // Fold the elbow so the forearm points up toward the head.
          rLow.rotation[cal.foldAxis] += w * cal.foldSign * 1.4;
          // Rock the hand side-to-side. Rather than trust a per-rig local axis
          // (which sent the arm backwards on some models), we read the LIVE
          // forearm direction (elbow->hand) and rotate about the world axis
          // that slides the hand along screen-horizontal (world X). That makes
          // the wave horizontal for any rig and any arm orientation, while the
          // raised lift+fold pose above stays exactly where it should.
          rLow.updateWorldMatrix(true, true);
          rLow.getWorldPosition(_elbowPos);
          (rHand || rLow).getWorldPosition(_handPos);
          _forearm.subVectors(_handPos, _elbowPos);
          // Axis perpendicular to world-X and the forearm => rotating about it
          // moves the hand left<->right. Fall back to camera-forward if the
          // forearm happens to point straight along X.
          _swingAxis.set(1, 0, 0).cross(_forearm);
          if (_swingAxis.lengthSq() < 1e-6) _swingAxis.set(0, 0, 1);
          _swingAxis.normalize();
          // Express that world axis in the forearm's local space, then rock.
          rLow.parent.getWorldQuaternion(_swingParentQuat);
          _swingAxis.applyQuaternion(_swingParentQuat.invert());
          _swingQuat.setFromAxisAngle(_swingAxis, Math.sin(t * 9) * 0.5 * w);
          rLow.quaternion.premultiply(_swingQuat);
        }
      }
    }

    vrm.update(delta);

    // Reveal only once framed AND a couple of correct frames have rendered,
    // then drop the loading overlay. Until then the scene stays hidden so no
    // half-rendered / un-posed body (legs) is ever shown.
    if (!readyRef.current && framedRef.current) {
      revealFramesRef.current += 1;
      if (revealFramesRef.current >= 2) {
        vrm.scene.visible = true;
        readyRef.current = true;
        if (onReadyRef.current) onReadyRef.current();
      }
    }
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOFT KAWAII PLACEHOLDER (only if no .vrm is available)
   ═══════════════════════════════════════════════════════════════════════════ */

function CuteFallback({
  analyserRef,
  speakingRef,
  emotion = "neutral",
  onReady,
}) {
  const groupRef = useRef();
  const mouthRef = useRef();
  const eyesRef = useRef();
  const browLRef = useRef();
  const browRRef = useRef();
  const st = useAnimationState();

  // The placeholder is ready immediately; let the parent drop the loader.
  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);

  useFrame((state, delta) => {
    const s = st.current;
    const t = state.clock.elapsedTime;
    const analyser = analyserRef && analyserRef.current;
    if (
      analyser &&
      analyser.frequencyBinCount &&
      analyser.frequencyBinCount !== s.data.length
    ) {
      s.data = new Uint8Array(analyser.frequencyBinCount);
    }
    const speaking = !!(speakingRef && speakingRef.current);
    let amp = 0;
    if (speaking && analyser)
      amp = Math.min(1, readAmplitude(analyser, s.data) * 3.4);
    else if (speaking) amp = 0.3 + 0.2 * Math.abs(Math.sin(t * 9));
    const targetJaw = speaking ? amp : 0;
    s.jaw += (targetJaw - s.jaw) * Math.min(1, delta * 16);

    let active = emotion;
    if (DEMO_MODE) active = DEMO_CYCLE[Math.floor(t / 2.5) % DEMO_CYCLE.length];
    const preset = EMOTION_PRESETS[active] || EMOTION_PRESETS.neutral;
    s.expr.happy = lerpTo(s.expr.happy || 0, preset.happy, delta, 4);
    s.expr.surprised = lerpTo(
      s.expr.surprised || 0,
      preset.surprised,
      delta,
      4,
    );
    s.expr.sad = lerpTo(s.expr.sad || 0, preset.sad, delta, 4);

    if (mouthRef.current) {
      // open with voice; widen (smile) with happy; round with surprise
      const open = 0.35 + s.jaw * 1.4 + s.expr.surprised * 0.8;
      mouthRef.current.scale.y = open;
      mouthRef.current.scale.x =
        1 + s.expr.happy * 0.8 - s.expr.surprised * 0.3;
    }
    const blinkVal = stepBlink(s.blink, delta);
    if (eyesRef.current) {
      const wide = 1 + s.expr.surprised * 0.5;
      eyesRef.current.scale.y = Math.max(0.1, wide - blinkVal);
    }
    if (browLRef.current && browRRef.current) {
      const raise = s.expr.surprised * 0.05 - s.expr.sad * 0.02;
      browLRef.current.position.y = 0.2 + raise;
      browRRef.current.position.y = 0.2 + raise;
      browLRef.current.rotation.z = 0.1 + s.expr.sad * 0.3;
      browRRef.current.rotation.z = -0.1 - s.expr.sad * 0.3;
    }
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.12;
      groupRef.current.position.y = 1.3 + Math.sin(t * 1.4) * 0.02;
      groupRef.current.rotation.z = lerpTo(
        groupRef.current.rotation.z || 0,
        preset.tiltZ || 0,
        delta,
        2.5,
      );
    }
  });

  const headMat = {
    color: "#ffe3ef",
    emissive: "#ffc2dd",
    emissiveIntensity: 0.35,
    roughness: 0.4,
  };
  return (
    <group ref={groupRef} position={[0, 1.3, 0]}>
      <mesh>
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshStandardMaterial {...headMat} />
      </mesh>
      <mesh position={[0, 0.42, 0]} scale={[0.5, 0.4, 0.5]}>
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshStandardMaterial color="#c59bf0" roughness={0.6} />
      </mesh>
      <mesh ref={browLRef} position={[-0.15, 0.2, 0.38]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.1, 0.018, 0.02]} />
        <meshStandardMaterial color="#7a5c8a" />
      </mesh>
      <mesh ref={browRRef} position={[0.15, 0.2, 0.38]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.1, 0.018, 0.02]} />
        <meshStandardMaterial color="#7a5c8a" />
      </mesh>
      <group ref={eyesRef} position={[0, 0.05, 0]}>
        <mesh position={[-0.15, 0, 0.37]}>
          <sphereGeometry args={[0.06, 24, 24]} />
          <meshStandardMaterial color="#3a2f4a" />
        </mesh>
        <mesh position={[0.15, 0, 0.37]}>
          <sphereGeometry args={[0.06, 24, 24]} />
          <meshStandardMaterial color="#3a2f4a" />
        </mesh>
        <mesh position={[-0.13, 0.03, 0.41]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.6}
          />
        </mesh>
        <mesh position={[0.17, 0.03, 0.41]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.6}
          />
        </mesh>
      </group>
      <mesh position={[-0.25, -0.07, 0.34]} scale={[1, 0.7, 0.2]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#ff8fb0" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.25, -0.07, 0.34]} scale={[1, 0.7, 0.2]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#ff8fb0" transparent opacity={0.6} />
      </mesh>
      <mesh ref={mouthRef} position={[0, -0.14, 0.38]} scale={[1, 0.35, 1]}>
        <sphereGeometry args={[0.05, 20, 20]} />
        <meshStandardMaterial color="#d76a82" />
      </mesh>
    </group>
  );
}

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.warn(
      "Avatar3D: could not load a .vrm avatar, showing placeholder. " +
        "Add frontend/public/avatars/aria.vrm (see LIVE_AVATAR_README.md).",
      err,
    );
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const _overlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "14px",
  zIndex: 5,
  background: "radial-gradient(circle at 50% 42%, #232a47 0%, #141a2e 100%)",
};
const _spinnerStyle = {
  width: "46px",
  height: "46px",
  borderRadius: "50%",
  border: "4px solid rgba(199, 184, 255, 0.25)",
  borderTopColor: "#c7b8ff",
  animation: "aria-avatar-spin 0.9s linear infinite",
};
const _loadingTextStyle = {
  color: "#c7b8ff",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
};
const _avatarWrapperStyle = { position: "relative" };

function AvatarLoadingOverlay() {
  return (
    <div style={_overlayStyle}>
      <div style={_spinnerStyle} />
      <div style={_loadingTextStyle}>Loading avatar…</div>
      <style>
        {"@keyframes aria-avatar-spin { to { transform: rotate(360deg); } }"}
      </style>
    </div>
  );
}

export default function Avatar3D({
  analyserRef,
  speakingRef,
  emotion = "neutral",
  waving = false,
}) {
  const url = useMemo(() => AVATAR_URL, []);
  // Loading gate: keep the overlay up until the avatar is fully posed + framed
  // (or the placeholder takes over), so the first un-posed frames never show.
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  const errorFallback = (
    <CuteFallback
      analyserRef={analyserRef}
      speakingRef={speakingRef}
      emotion={emotion}
      onReady={handleReady}
    />
  );
  return (
    <div className="w-full h-full" style={_avatarWrapperStyle}>
      <Canvas
        dpr={[1, 1.5]}
        gl={GL_PROPS}
        camera={CAMERA_PROPS}
        style={CANVAS_STYLE}
      >
        <ambientLight intensity={1.25} />
        <directionalLight position={[1, 2, 3]} intensity={1.4} />
        <directionalLight
          position={[-2, 1, 1]}
          intensity={0.5}
          color="#c7b8ff"
        />
        <ModelErrorBoundary fallback={errorFallback}>
          <Suspense fallback={null}>
            <VRMAvatar
              url={url}
              analyserRef={analyserRef}
              speakingRef={speakingRef}
              emotion={emotion}
              waving={waving}
              onReady={handleReady}
            />
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>
      {!ready && <AvatarLoadingOverlay />}
    </div>
  );
}
