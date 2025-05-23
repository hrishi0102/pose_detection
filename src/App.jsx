import React, { useRef, useEffect, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const [poseLandmarker, setPoseLandmarker] = useState(null);
  const [referencePose, setReferencePose] = useState(null);
  const [isPoseMatched, setIsPoseMatched] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const drawingUtilsRef = useRef(null);
  const imageDrawingUtilsRef = useRef(null);

  // Timer state variables
  const [holdTime, setHoldTime] = useState(0); // Current hold time in seconds
  const [targetTime, setTargetTime] = useState(5); // Target time to hold (5 seconds default)
  const [timerActive, setTimerActive] = useState(false); // Whether timer is currently running
  const [challengeComplete, setChallengeComplete] = useState(false); // Whether challenge is complete

  // Gamification state
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [sequence, setSequence] = useState([
    {
      id: 1,
      name: "Warrior Pose II",
      imagePath: "/warrior-pose.jpg",
      completed: false,
      points: 100,
      difficultyMultiplier: 1.0,
    },
    {
      id: 2,
      name: "Upward Dog",
      imagePath: "/upward-dog.jpg",
      completed: false,
      points: 150,
      difficultyMultiplier: 1.2,
    },
    {
      id: 3,
      name: "Tree Pose",
      imagePath: "/tree-pose.jpg",
      completed: false,
      points: 200,
      difficultyMultiplier: 1.4,
    },
    {
      id: 4,
      name: "Downward Dog",
      imagePath: "/downward-dog.jpg",
      completed: false,
      points: 250,
      difficultyMultiplier: 1.6,
    },
  ]);

  // Load the MediaPipe model
  useEffect(() => {
    const loadModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU", // fallback handled internally
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
      });

      setPoseLandmarker(landmarker);
    };

    loadModel();
  }, []);

  // Start the webcam
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing webcam:", error);
      }
    };

    startCamera();

    return () => {
      // Clean up video stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  // Initialize canvases once elements are ready
  useEffect(() => {
    if (canvasRef.current) {
      const videoCanvas = canvasRef.current;
      const ctx = videoCanvas.getContext("2d");
      drawingUtilsRef.current = new DrawingUtils(ctx);
    }

    if (imageCanvasRef.current) {
      const imageCanvas = imageCanvasRef.current;
      const ctx = imageCanvas.getContext("2d");
      imageDrawingUtilsRef.current = new DrawingUtils(ctx);
    }
  }, []);

  // Process the reference image whenever the currentPoseIndex changes
  useEffect(() => {
    if (
      !poseLandmarker ||
      !imageRef.current ||
      !imageCanvasRef.current ||
      !imageDrawingUtilsRef.current
    )
      return;

    // Reset challenge state when changing poses
    setChallengeComplete(false);
    setHoldTime(0);
    setTimerActive(false);
    setReferencePose(null);

    const analyzeReferenceImage = async () => {
      // Wait for the image to load
      if (!imageRef.current.complete) {
        imageRef.current.onload = analyzeReferenceImage;
        return;
      }

      const imageWidth = imageRef.current.naturalWidth;
      const imageHeight = imageRef.current.naturalHeight;

      // Set canvas dimensions to match the image
      imageCanvasRef.current.width = imageWidth;
      imageCanvasRef.current.height = imageHeight;

      // Clear the canvas
      const ctx = imageCanvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, imageWidth, imageHeight);

      try {
        // Change to IMAGE mode for single image detection
        await poseLandmarker.setOptions({ runningMode: "IMAGE" });
        const results = await poseLandmarker.detect(imageRef.current);

        // Store the reference pose landmarks
        if (results.landmarks && results.landmarks.length > 0) {
          setReferencePose(results.landmarks[0]);

          // Draw landmarks on the reference image
          imageDrawingUtilsRef.current.drawConnectors(
            results.landmarks[0],
            PoseLandmarker.POSE_CONNECTIONS,
            { color: "#00FF00", lineWidth: 2 }
          );
          imageDrawingUtilsRef.current.drawLandmarks(results.landmarks[0], {
            color: "#FF0000",
            radius: 3,
          });
        }

        // Change back to VIDEO mode for webcam
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
      } catch (error) {
        console.error("Error analyzing reference image:", error);
      }
    };

    analyzeReferenceImage();
  }, [poseLandmarker, currentPoseIndex]);

  // Timer effect to track hold time
  useEffect(() => {
    let interval;

    if (isPoseMatched && !challengeComplete) {
      if (!timerActive) {
        setTimerActive(true);
        setHoldTime(0); // Reset timer when pose is initially matched
      }

      // Start the timer interval
      interval = setInterval(() => {
        setHoldTime((prevTime) => {
          const newTime = prevTime + 0.1; // Increment by 0.1 seconds

          // Check if target time reached
          if (newTime >= targetTime && !challengeComplete) {
            // Mark pose as completed and award points
            const currentPose = sequence[currentPoseIndex];
            const pointsEarned = Math.round(
              currentPose.points *
                currentPose.difficultyMultiplier *
                (targetTime / 5) // Time multiplier - longer holds are worth more
            );

            // Update the sequence state
            setSequence((prev) => {
              const updated = [...prev];
              updated[currentPoseIndex] = {
                ...updated[currentPoseIndex],
                completed: true,
              };
              return updated;
            });

            // Add points to score
            setScore((prev) => prev + pointsEarned);

            // Show completion alert with points
            setChallengeComplete(true);
            setShowAlert(true);
            setTimeout(() => setShowAlert(false), 3000);

            clearInterval(interval);
          }

          return newTime;
        });
      }, 100); // Update every 100ms for smoother progress
    } else {
      // If pose is no longer matched, reset timer
      if (timerActive && !challengeComplete) {
        setTimerActive(false);
        setHoldTime(0);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    isPoseMatched,
    timerActive,
    challengeComplete,
    targetTime,
    sequence,
    currentPoseIndex,
  ]);

  // Process video frames
  useEffect(() => {
    if (
      !poseLandmarker ||
      !videoRef.current ||
      !canvasRef.current ||
      !referencePose ||
      !drawingUtilsRef.current
    )
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let animationId;
    const MATCH_THRESHOLD = 0.8;
    let lastVideoTime = -1;

    const detect = async () => {
      if (video.readyState < 2) {
        animationId = requestAnimationFrame(detect);
        return;
      }

      // Only process if video time has changed
      if (lastVideoTime === video.currentTime) {
        animationId = requestAnimationFrame(detect);
        return;
      }

      lastVideoTime = video.currentTime;

      // Ensure canvas matches video dimensions
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const results = await poseLandmarker.detectForVideo(
          video,
          performance.now()
        );

        if (results.landmarks && results.landmarks.length > 0) {
          // Draw landmarks
          drawingUtilsRef.current.drawConnectors(
            results.landmarks[0],
            PoseLandmarker.POSE_CONNECTIONS,
            { color: "#00FF00", lineWidth: 2 }
          );
          drawingUtilsRef.current.drawLandmarks(results.landmarks[0], {
            color: "#FF0000",
            radius: 3,
          });

          // Compare with reference pose
          const similarity = comparePoses(results.landmarks[0], referencePose);
          const currentMatch = similarity > MATCH_THRESHOLD;

          setIsPoseMatched(currentMatch);
        }
      } catch (error) {
        console.error("Error in pose detection:", error);
      }

      // Continue the detection loop
      animationId = requestAnimationFrame(detect);
    };

    // Start detection
    detect();

    // Cleanup function
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [poseLandmarker, referencePose]);

  // Utility: get the 3D angle at point B formed by points A–B–C
  function getAngle(A, B, C) {
    const AB = { x: A.x - B.x, y: A.y - B.y };
    const CB = { x: C.x - B.x, y: C.y - B.y };
    const dot = AB.x * CB.x + AB.y * CB.y;
    const magAB = Math.hypot(AB.x, AB.y);
    const magCB = Math.hypot(CB.x, CB.y);
    if (magAB === 0 || magCB === 0) return 0;
    const cosAngle = dot / (magAB * magCB);
    // Clamp float errors
    const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));
    return (angle * 180) / Math.PI; // in degrees
  }

  // Normalize pose: translate to mid-hip at (0,0) and scale so torso length = 1
  function normalizePose(landmarks) {
    const lh = landmarks[23]; // left hip
    const rh = landmarks[24]; // right hip
    const ls = landmarks[11]; // left shoulder
    const rs = landmarks[12]; // right shoulder

    // Center = mid-hip
    const center = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    // Torso length = distance between mid-hip and mid-shoulder
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const torsoLen =
      Math.hypot(shoulderMid.x - center.x, shoulderMid.y - center.y) || 1;

    return landmarks.map((pt) => ({
      x: (pt.x - center.x) / torsoLen,
      y: (pt.y - center.y) / torsoLen,
      z: pt.z != null ? pt.z / torsoLen : 0,
    }));
  }

  // Compare two poses by joint angles
  function comparePoses(pose1, pose2) {
    if (!pose1 || !pose2) return 0;
    // Normalize both
    const P1 = normalizePose(pose1);
    const P2 = normalizePose(pose2);

    // List of triplets [A, B, C] for key joints
    const joints = [
      [11, 13, 15], // left shoulder: elbow
      [12, 14, 16], // right shoulder: elbow
      [13, 11, 23], // left elbow: shoulder
      [14, 12, 24], // right elbow: shoulder
      [23, 25, 27], // left hip: knee
      [24, 26, 28], // right hip: knee
      [25, 23, 11], // left knee: hip
      [26, 24, 12], // right knee: hip
    ];

    let totalDiff = 0;
    joints.forEach(([a, b, c]) => {
      const angle1 = getAngle(P1[a], P1[b], P1[c]);
      const angle2 = getAngle(P2[a], P2[b], P2[c]);
      totalDiff += Math.abs(angle1 - angle2);
    });

    const avgDiff = totalDiff / joints.length; // in degrees
    const maxTolerance = 45; // allow up to 45° avg difference
    const similarity = Math.max(0, 1 - avgDiff / maxTolerance);
    return similarity; // 0 (no match) to 1 (perfect)
  }

  // Reset the current challenge
  const resetChallenge = () => {
    // Reset score
    setScore(0);

    // Reset pose completion status
    setSequence((prev) =>
      prev.map((pose) => ({
        ...pose,
        completed: false,
      }))
    );

    // Reset other states
    setChallengeComplete(false);
    setHoldTime(0);
    setTimerActive(false);
  };

  // Change the target time
  const handleTargetTimeChange = (e) => {
    setTargetTime(parseInt(e.target.value, 10));
    resetChallenge();
  };

  // Move to the next pose in the sequence
  const moveToNextPose = () => {
    // Reset challenge states without resetting the score
    setChallengeComplete(false);
    setHoldTime(0);
    setTimerActive(false);
    
    if (currentPoseIndex < sequence.length - 1) {
      // Move to next pose
      setCurrentPoseIndex(currentPoseIndex + 1);
    } else {
      // Complete the level if at the end of the sequence
      setLevel(level + 1);

      // Reset the sequence for the next level
      setSequence((prev) =>
        prev.map((pose) => ({
          ...pose,
          completed: false,
          // Increase difficulty for the next level
          difficultyMultiplier: pose.difficultyMultiplier * 1.2,
        }))
      );

      // Start from the first pose of the new level
      setCurrentPoseIndex(0);

      // Show level completion message
      setShowAlert(true);
      setTimeout(() => setShowAlert(false), 3000);
    }
  };

  // Go to a specific pose in the sequence
  const goToPose = (index) => {
    if (index < sequence.length) {
      setCurrentPoseIndex(index);
      // Reset challenge states without resetting the score
      setChallengeComplete(false);
      setHoldTime(0);
      setTimerActive(false);
    }
  };

  // Styles for the new UI
  const styles = {
    container: {
      textAlign: "center",
      fontFamily: "'Poppins', sans-serif",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "20px",
      backgroundColor: "#f8f9fa",
      borderRadius: "15px",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
    },
    header: {
      background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
      color: "white",
      padding: "20px",
      borderRadius: "10px",
      marginBottom: "25px",
      boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
    },
    title: {
      fontSize: "2.5rem",
      margin: "0 0 10px 0",
      fontWeight: "700",
    },
    scoreContainer: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      maxWidth: "400px",
      margin: "0 auto 20px",
      padding: "15px",
      borderRadius: "10px",
      backgroundColor: "white",
      boxShadow: "0 4px 10px rgba(0, 0, 0, 0.05)",
    },
    scoreItem: {
      textAlign: "center",
    },
    scoreLabel: {
      fontSize: "0.9rem",
      color: "#6b7280",
      marginBottom: "5px",
    },
    scoreValue: {
      fontSize: "1.8rem",
      fontWeight: "700",
      color: "#4f46e5",
    },
    sequenceContainer: {
      display: "flex",
      justifyContent: "center",
      margin: "25px 0",
      gap: "15px",
      flexWrap: "wrap",
    },
    poseIndicator: {
      width: "50px",
      height: "50px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontWeight: "bold",
      transition: "all 0.3s ease",
    },
    currentPoseName: {
      fontSize: "1.8rem",
      color: "#4f46e5",
      margin: "0 0 25px 0",
      fontWeight: "600",
    },
    controlsContainer: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "15px",
      margin: "20px 0",
      flexWrap: "wrap",
    },
    select: {
      padding: "10px 20px",
      fontSize: "1rem",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      backgroundColor: "white",
      boxShadow: "0 2px 5px rgba(0, 0, 0, 0.05)",
      outline: "none",
      cursor: "pointer",
    },
    button: {
      padding: "10px 25px",
      fontSize: "1rem",
      fontWeight: "600",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },
    resetButton: {
      backgroundColor: "#6366f1",
      color: "white",
    },
    nextButton: {
      backgroundColor: "#10b981",
      color: "white",
    },
    progressBarContainer: {
      margin: "25px auto",
      width: "80%",
      maxWidth: "600px",
    },
    progressBarOuter: {
      width: "100%",
      backgroundColor: "#e5e7eb",
      borderRadius: "10px",
      height: "15px",
      overflow: "hidden",
      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
    },
    progressBarInner: {
      height: "100%",
      transition: "width 0.1s ease-in-out",
      borderRadius: "10px",
    },
    progressText: {
      margin: "10px 0",
      fontSize: "1rem",
      color: "#4b5563",
    },
    contentContainer: {
      display: "flex",
      justifyContent: "center",
      gap: "30px",
      flexWrap: "wrap",
      margin: "20px 0",
    },
    videoContainer: {
      position: "relative",
      width: "480px",
      borderRadius: "15px",
      overflow: "hidden",
      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
    },
    videoTitle: {
      backgroundColor: "rgba(79, 70, 229, 0.9)",
      color: "white",
      padding: "12px 20px",
      margin: "0",
      fontSize: "1.2rem",
      fontWeight: "600",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    matchingIndicator: {
      backgroundColor: "#10b981",
      color: "white",
      padding: "5px 10px",
      borderRadius: "20px",
      fontSize: "0.9rem",
      fontWeight: "600",
    },
    videoElement: {
      transform: "scaleX(-1)",
      maxWidth: "100%",
      height: "auto",
      display: "block",
      backgroundColor: "#000",
    },
    canvasOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    },
    alertContainer: {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      color: "white",
      padding: "20px 40px",
      borderRadius: "10px",
      fontSize: "1.5rem",
      fontWeight: "bold",
      zIndex: 1000,
      boxShadow: "0 10px 25px rgba(16, 185, 129, 0.4)",
      animation: "slideDown 0.5s ease-out",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Yoga Pose Challenge</h1>
        <p style={{ margin: 0, fontSize: "1.2rem" }}>
          Master the poses, level up your practice
        </p>
      </div>

      {/* Score and level display */}
      <div style={styles.scoreContainer}>
        <div style={styles.scoreItem}>
          <div style={styles.scoreLabel}>LEVEL</div>
          <div style={styles.scoreValue}>{level}</div>
        </div>
        <div style={styles.scoreItem}>
          <div style={styles.scoreLabel}>SCORE</div>
          <div style={styles.scoreValue}>{score}</div>
        </div>
        <div style={styles.scoreItem}>
          <div style={styles.scoreLabel}>POSE</div>
          <div style={styles.scoreValue}>
            {currentPoseIndex + 1}/{sequence.length}
          </div>
        </div>
      </div>

      {/* Sequence progress */}
      <div style={styles.sequenceContainer}>
        {sequence.map((pose, index) => (
          <div
            key={pose.id}
            onClick={() => goToPose(index)}
            style={{
              ...styles.poseIndicator,
              backgroundColor:
                index === currentPoseIndex
                  ? "#4f46e5"
                  : pose.completed
                  ? "#10b981"
                  : "#e5e7eb",
              color:
                index === currentPoseIndex || pose.completed
                  ? "white"
                  : "#6b7280",
              boxShadow:
                index === currentPoseIndex
                  ? "0 0 15px rgba(79, 70, 229, 0.5)"
                  : pose.completed
                  ? "0 0 10px rgba(16, 185, 129, 0.3)"
                  : "none",
              transform: index === currentPoseIndex ? "scale(1.1)" : "scale(1)",
            }}
          >
            {index + 1}
          </div>
        ))}
      </div>

      {/* Current pose name */}
      <h2 style={styles.currentPoseName}>{sequence[currentPoseIndex]?.name}</h2>

      {/* Timer settings */}
      <div style={styles.controlsContainer}>
        <label
          htmlFor="timeSelect"
          style={{ fontSize: "1rem", color: "#4b5563" }}
        >
          Hold pose for:
        </label>
        <select
          id="timeSelect"
          value={targetTime}
          onChange={handleTargetTimeChange}
          style={styles.select}
        >
          <option value="3">3 seconds</option>
          <option value="5">5 seconds</option>
          <option value="10">10 seconds</option>
          <option value="15">15 seconds</option>
          <option value="30">30 seconds</option>
        </select>
        <button
          onClick={resetChallenge}
          style={{ ...styles.button, ...styles.resetButton }}
        >
          Reset
        </button>

        {challengeComplete && (
          <button
            onClick={moveToNextPose}
            style={{ ...styles.button, ...styles.nextButton }}
          >
            Next Pose
          </button>
        )}
      </div>

      {/* Timer progress bar */}
      <div style={styles.progressBarContainer}>
        <div style={styles.progressBarOuter}>
          <div
            style={{
              ...styles.progressBarInner,
              width: `${(holdTime / targetTime) * 100}%`,
              backgroundColor: challengeComplete ? "#10b981" : "#4f46e5",
            }}
          ></div>
        </div>
        <p style={styles.progressText}>
          {challengeComplete
            ? "Challenge complete! 🎉"
            : isPoseMatched
            ? `Holding: ${holdTime.toFixed(1)}s / ${targetTime}s`
            : "Align your pose with the reference image"}
        </p>
      </div>

      <div style={styles.contentContainer}>
        {/* Reference Image */}
        <div style={styles.videoContainer}>
          <h2 style={styles.videoTitle}>Reference Pose</h2>
          <div style={{ position: "relative", width: "100%", height: "auto" }}>
            <img
              ref={imageRef}
              src={sequence[currentPoseIndex]?.imagePath}
              alt={`${sequence[currentPoseIndex]?.name} Reference`}
              style={{ maxWidth: "100%", height: "auto", display: "block" }}
            />
            <canvas
              ref={imageCanvasRef}
              style={{
                ...styles.canvasOverlay,
                transform: "none",
              }}
            />
          </div>
        </div>

        {/* Webcam Feed */}
        <div style={styles.videoContainer}>
          <h2 style={styles.videoTitle}>
            Your Pose
            {isPoseMatched && (
              <span style={styles.matchingIndicator}>Matching!</span>
            )}
          </h2>
          <div style={{ position: "relative", width: "100%", height: "auto" }}>
            <video
              ref={videoRef}
              style={styles.videoElement}
              muted
              autoPlay
              playsInline
            />
            <canvas
              ref={canvasRef}
              style={{
                ...styles.canvasOverlay,
                transform: "scaleX(-1)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Alert Message */}
      {showAlert && (
        <div style={styles.alertContainer}>
          {challengeComplete ? (
            <>
              Challenge Complete!
              <br />+
              {Math.round(
                sequence[currentPoseIndex].points *
                  sequence[currentPoseIndex].difficultyMultiplier *
                  (targetTime / 5)
              )}{" "}
              Points
            </>
          ) : (
            <>Level {level} Complete! All poses mastered!</>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
