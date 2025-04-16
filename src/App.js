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

    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    let camera = null;

    const LEAVE_TIME_SEC = 5; // 자리 비움 설정 시간 (초)

    const currentPoseRef = useRef("");
    const poseStartTimeRef = useRef(Date.now());
    const poseDurationRef = useRef({
        정자세: 0,
        기울어짐: 0,
        엎드림: 0,
        자리비움: 0,
    });

    const checkLeaveRef = useRef(false);
    const leaveTimeoutRef = useRef(null);

    // expo 프로젝트에서 측정 종료 신호 받는 이벤트 리스너
    // ios
    window.addEventListener("message", (e) => {
        // 전달받은 데이터가 측정 종료일 경우 실행
        if (e.data === "측정 종료") endDetect();
    });
    // android
    document.addEventListener("message", (e) => {
        // 전달받은 데이터가 측정 종료일 경우 실행
        if (e.data === "측정 종료") endDetect();
    });

    // 측정 종료 시 호출되는 함수
    // 이 프로젝트에서는 측정 종료를 할 수 없음 -> 그 기능이 없어
    // 측정 종료 기능은 웹뷰띄우는 프로젝트에 있다
    // 그럼 어떻게 하느냐
    // expo 프로젝트에서 측정 종료 버튼 누르면 리액트 프로젝트(Pose)로 신호를 준다
    // 리액트 프로젝트에선 신호를 받으면 밑에 함수를 실행하도록 한다
    const endDetect = () => {
        // 현재 시간 데이터를 담아놓은 변수(state)가 있다 -> poseDurations
        // poseDurations <- 얘를 웹뷰한테 전해주면 됨
        window.ReactNativeWebview.postMessage(JSON.parse(poseDurations));
    };

    const updatePoseTime = (pose) => {
        const now = Date.now();
        const elapsedTime = (now - poseStartTimeRef.current) / 1000; // 초 단위

        // 기존 자세의 시간 누적
        if (currentPoseRef.current) {
            poseDurationRef.current[currentPoseRef.current] += elapsedTime;
        }

        // 새로운 자세 시작
        poseStartTimeRef.current = now;
        currentPoseRef.current = pose;

        // 상태 업데이트
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
        if (shoulderSlope < 0.05 && -0.05 < headPosition < 0.1) {
            status = "정자세";
        } else if (shoulderSlope >= 0.05) {
            status = "기울어짐";
        } else {
            status = "엎드림";
        }

        // 자세가 변경된 경우, 시간 측정 업데이트
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
                {
                    color: "#00FF00",
                    lineWidth: 2,
                }
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
        const userPose = new Pose({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        userPose.setOptions({
            selfieMode: true,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        userPose.onResults(onResults);

        const interval = setInterval(() => {
            const video = webcamRef.current?.video;
            if (video && video.readyState >= 3) {
                userPose.send({ image: video });
            }
        }, 100); // 10fps

        return () => {
            clearInterval(interval);
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
