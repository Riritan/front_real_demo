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

    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState("");

    const webcamRef = useRef(null);
    const canvasRef = useRef(null);

    const poseStartTimeRef = useRef(Date.now());
    const poseDurationRef = useRef({
        정자세: 0,
        기울어짐: 0,
        엎드림: 0,
        자리비움: 0,
    });

    const lastPostureRef = useRef("");
    const lastUpdateTimeRef = useRef(Date.now());
    const continuousBadPostureTimeRef = useRef(0);

    const checkLeaveRef = useRef(false);
    const leaveTimeoutRef = useRef(null);

    const LEAVE_TIME_SEC = 5;

    window.addEventListener("message", (e) => {
        if (e.data === "측정 종료") endDetect();
    });

    document.addEventListener("message", (e) => {
        if (e.data === "측정 종료") endDetect();
    });

    const endDetect = () => {
        window.ReactNativeWebView?.postMessage(
            JSON.stringify(poseDurationRef.current)
        );
    };

    const updatePoseTime = (newPose) => {
        const now = Date.now();
        const elapsedTime = (now - lastUpdateTimeRef.current) / 1000;

        if (lastPostureRef.current) {
            poseDurationRef.current[lastPostureRef.current] += elapsedTime;
        }

        lastPostureRef.current = newPose;
        lastUpdateTimeRef.current = now;
        setPoseDurations({ ...poseDurationRef.current });
    };

    const poseDetect = (landmarks) => {
        const LEFT_SHOULDER = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
        const RIGHT_SHOULDER = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
        const NOSE = landmarks[POSE_LANDMARKS.NOSE];

        const shoulderSlope = Math.abs(LEFT_SHOULDER.y - RIGHT_SHOULDER.y);
        const shoulderCenter = {
            x: (LEFT_SHOULDER.x + RIGHT_SHOULDER.x) / 2,
            y: (LEFT_SHOULDER.y + RIGHT_SHOULDER.y) / 2,
        };
        const headPosition = NOSE.y - shoulderCenter.y;

        let status = "";
        if (
            shoulderSlope < 0.05 &&
            -0.05 < headPosition &&
            headPosition < 0.1
        ) {
            status = "엎드림";
        } else if (shoulderSlope >= 0.05) {
            status = "기울어짐";
        } else {
            status = "정자세";
        }

        const now = Date.now();
        const elapsed = (now - poseStartTimeRef.current) / 1000;
        poseStartTimeRef.current = now;

        // 자세 변경시 누적시간 갱신
        if (lastPostureRef.current !== status) {
            updatePoseTime(status);
        }

        // 연속 나쁜자세 시간 관리
        if (status === "기울어짐" || status === "엎드림") {
            continuousBadPostureTimeRef.current += elapsed;
        } else {
            continuousBadPostureTimeRef.current = 0;
            setShowModal(false);
        }

        // ⭐ 20초 이상 나쁜 자세일 때 모달 띄우고 RN에 바로 전송
        if (continuousBadPostureTimeRef.current >= 20) {
            if (!showModal) {
                let message = "";
                if (status === "엎드림") {
                    message =
                        "20초 이상 연속으로 엎드린 자세입니다! 허리를 곧게 펴세요!";
                } else if (status === "기울어짐") {
                    message =
                        "20초 이상 연속으로 기울어진 자세입니다! 바른 자세로 돌아가세요!";
                }
                setModalMessage(message);
                setShowModal(true);

                window.ReactNativeWebView?.postMessage(
                    JSON.stringify({
                        type: "BAD_POSTURE_WARNING",
                        pose: status,
                        duration: continuousBadPostureTimeRef.current,
                        message: message,
                    })
                );
            }
        }

        // 연속 나쁜자세 시간 관리
        if (status === "기울어짐" || status === "엎드림") {
            continuousBadPostureTimeRef.current += elapsed;
        } else {
            continuousBadPostureTimeRef.current = 0;
            setShowModal(false);
        }

        // ⭐ 15초 이상 나쁜 자세일 때 모달 띄우고 RN에 바로 전송
        if (continuousBadPostureTimeRef.current >= 15) {
            if (!showModal) {
                let message = "";
                if (status === "엎드림") {
                    message =
                        "15초 이상 연속으로 엎드린 자세입니다! 허리를 곧게 펴세요!";
                } else if (status === "기울어짐") {
                    message =
                        "15초 이상 연속으로 기울어진 자세입니다! 바른 자세로 돌아가세요!";
                }
                setModalMessage(message);
                setShowModal(true);

                window.ReactNativeWebView?.postMessage(
                    JSON.stringify({
                        type: "BAD_POSTURE_WARNING",
                        pose: status,
                        duration: continuousBadPostureTimeRef.current,
                        message: message,
                    })
                );
            }
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
            canvasCtx.clearRect(
                0,
                0,
                canvasElement.width,
                canvasElement.height
            );
            canvasCtx.drawImage(
                results.image,
                0,
                0,
                canvasElement.width,
                canvasElement.height
            );

            drawConnectors(
                canvasCtx,
                results.poseLandmarks,
                [
                    [0, 1],
                    [1, 2],
                    [0, 4],
                    [4, 5],
                    [11, 12],
                ],
                { color: "#00FF00", lineWidth: 2 }
            );
            drawLandmarks(canvasCtx, results.poseLandmarks, {
                color: "red",
                lineWidth: 2,
                radius: 3,
            });
            drawConnectors(
                canvasCtx,
                results.poseLandmarks,
                [
                    [0, 1],
                    [1, 2],
                    [0, 4],
                    [4, 5],
                    [11, 12],
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
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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
            {/* ✅ 모달 표시 */}
            {showModal && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "rgba(0,0,0,0.5)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: "white",
                            padding: 20,
                            borderRadius: 10,
                            textAlign: "center",
                        }}
                    >
                        <p
                            style={{
                                fontSize: 18,
                                fontWeight: "bold",
                                color: "red",
                            }}
                        >
                            {modalMessage}
                        </p>
                        <button
                            onClick={() => setShowModal(false)}
                            style={{ marginTop: 10, fontSize: 16 }}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}
            {/* ✅ 자세 및 시간 표시 */}
            {/* ✅ 모달 표시 */}
            {showModal && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "rgba(0,0,0,0.5)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: "white",
                            padding: 20,
                            borderRadius: 10,
                            textAlign: "center",
                        }}
                    >
                        <p
                            style={{
                                fontSize: 18,
                                fontWeight: "bold",
                                color: "red",
                            }}
                        >
                            {modalMessage}
                        </p>
                        <button
                            onClick={() => setShowModal(false)}
                            style={{ marginTop: 10, fontSize: 16 }}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}
            {/* ✅ 자세 및 시간 표시 */}
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
            />
        </div>
    );
};

export default UserPose;
