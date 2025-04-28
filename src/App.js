import * as cam from "@mediapipe/camera_utils";
import { Pose, POSE_LANDMARKS } from "@mediapipe/pose";
import React, { useEffect, useRef, useState } from "react";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import Webcam from "react-webcam";

const UserPose = () => {
    const [poseText, setPoseText] = useState("");
    const [poseDurations, setPoseDurations] = useState({
        정자세: 0,
        기울어짐: 0,
        엎드림: 0,
        자리비움: 0,
    });

    const [showAlert, setShowAlert] = useState(false);

    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    let camera = null;

    const LEAVE_TIME_SEC = 5;

    const currentPoseRef = useRef("");
    const poseStartTimeRef = useRef(Date.now());
    const poseDurationRef = useRef({
        정자세: 0,
        기울어짐: 0,
        엎드림: 0,
        자리비움: 0,
    });

    const continuousTiltedTimeRef = useRef(0); // ⭐ 연속 기울어진 시간 관리용

    const checkLeaveRef = useRef(false);
    const leaveTimeoutRef = useRef(null);

    window.addEventListener("message", (e) => {
        if (e.data === "측정 종료") endDetect();
    });

    document.addEventListener("message", (e) => {
        if (e.data === "측정 종료") endDetect();
    });

    const endDetect = () => {
        window.ReactNativeWebView?.postMessage(JSON.parse(poseDurations));
    };

    const updatePoseTime = (pose) => {
        const now = Date.now();
        const elapsedTime = (now - poseStartTimeRef.current) / 1000;

        if (currentPoseRef.current) {
            poseDurationRef.current[currentPoseRef.current] += elapsedTime;
        }

        poseStartTimeRef.current = now;
        currentPoseRef.current = pose;
        setPoseDurations({ ...poseDurationRef.current });
    };

    const poseDetect = (landmarks) => {
        const LEFT_SHOULDER = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const RIGHT_SHOULDER = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const NOSE = landmarks[POSE_LANDMARKS.NOSE];
    
        const leftShoulder = { x: LEFT_SHOULDER.x, y: LEFT_SHOULDER.y };
        const rightShoulder = { x: RIGHT_SHOULDER.x, y: RIGHT_SHOULDER.y };
        const nose = { x: NOSE.x, y: NOSE.y };
    
        const shoulderSlope = Math.abs(leftShoulder.y - rightShoulder.y);
        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
        };
        const headPosition = nose.y - shoulderCenter.y;
    
        let status = "";
        if (shoulderSlope < 0.05 && -0.05 < headPosition && headPosition < 0.1) {
            status = "정자세";
        } else if (shoulderSlope >= 0.05) {
            status = "기울어짐";
        } else {
            status = "엎드림";
        }
    
        const now = Date.now();
        const elapsed = (now - poseStartTimeRef.current) / 1000;
    
        // ⭐ 수정된 부분
        if (status === "기울어짐" || status === "엎드림") {
            continuousTiltedTimeRef.current += elapsed;
        } else {
            continuousTiltedTimeRef.current = 0; // 정자세 또는 자리비움이면 초기화
        }
    
        poseStartTimeRef.current = now; // 마지막 자세 변경 시간 갱신
    
        if (continuousTiltedTimeRef.current >= 20) {
            if (!showAlert) {
                setShowAlert(true);
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: "BAD_POSTURE_WARNING",
                    pose: status,
                    duration: continuousTiltedTimeRef.current,
                    message: "20초 이상 연속으로 잘못된 자세입니다! 바른 자세로 돌아가세요!"
                }));
            }
        } else {
            setShowAlert(false);
        }
    
        if (currentPoseRef.current !== status) {
            updatePoseTime(status);
        }
    
        setPoseText(status);
        return { status };
    };    

    function onResults(results) {
        try {
            if (!webcamRef.current || !canvasRef.current) return;

            const canvasElement = canvasRef.current;
            const canvasCtx = canvasElement.getContext("2d");

            canvasElement.width = webcamRef.current.video.videoWidth;
            canvasElement.height = webcamRef.current.video.videoHeight;

            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

            drawConnectors(
                canvasCtx,
                results.poseLandmarks,
                [
                    [0, 1], [1, 2], [0, 4], [4, 5], [11, 12],
                ],
                { color: "#00FF00", lineWidth: 2 }
            );
            drawLandmarks(canvasCtx, results.poseLandmarks, {
                color: "red",
                lineWidth: 2,
                radius: 3,
            });

            const { status } = poseDetect(results.poseLandmarks);

            if (checkLeaveRef.current) {
                checkLeaveRef.current = false;
                setPoseText(status);

                if (leaveTimeoutRef.current) {
                    clearTimeout(leaveTimeoutRef.current);
                    leaveTimeoutRef.current = null;
                }
            }

            canvasCtx.restore();
        } catch (e) {
            if (checkLeaveRef.current) return;

            checkLeaveRef.current = true;
            poseStartTimeRef.current = Date.now();

            leaveTimeoutRef.current = setTimeout(() => {
                updatePoseTime("자리비움");
                setPoseText("자리비움");
                checkLeaveRef.current = false;
            }, LEAVE_TIME_SEC * 1000);
        }
    }

    useEffect(() => {
        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
            modelComplexity: 1,
            selfieMode: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        pose.onResults(onResults);

        let isActive = true;

        const detectFrame = async () => {
            const video = webcamRef.current?.video;

            if (isActive && video && video.readyState >= 3) {
                try {
                    await pose.send({ image: video });
                } catch (e) {
                    console.error("🔥 pose.send 실패:", e);
                }
            }

            if (isActive) requestAnimationFrame(detectFrame);
        };

        requestAnimationFrame(detectFrame);

        return () => {
            isActive = false;
            pose.close();
        };
    }, []);

    return (
        <div className="App">
            <div
                style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    color: "red",
                    fontSize: "20px",
                    fontWeight: "bold",
                    zIndex: 10,
                }}
            >
                <p>자세: {poseText}</p>
                {showAlert && (
                    <p
                        style={{
                            color: "red",
                            fontSize: "18px",
                            marginTop: "4px",
                        }}
                    >
                        ⚠️ 20초 이상 연속으로 기울어진 자세입니다! 바른 자세로 돌아가세요!
                    </p>
                )}
                <p>정자세: {poseDurations.정자세.toFixed(1)}초</p>
                <p>기울어짐: {poseDurations.기울어짐.toFixed(1)}초</p>
                <p>엎드림: {poseDurations.엎드림.toFixed(1)}초</p>
                <p>자리비움: {poseDurations.자리비움.toFixed(1)}초</p>
            </div>
            <Webcam
                ref={webcamRef}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    zIndex: 9,
                    width: "100%",
                    height: "100%",
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    zIndex: 9,
                    width: "100%",
                    height: "100%",
                }}
            ></canvas>
        </div>
    );
};

export default UserPose;
