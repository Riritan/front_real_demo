import * as cam from "@mediapipe/camera_utils";
import { Pose ,POSE_LANDMARKS} from "@mediapipe/pose";
import React, { useEffect, useRef } from 'react';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import Webcam from 'react-webcam';

const UserPose = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  let camera = null;
  const poseDetect = (landmarks) => {
    const LEFT_SHOULDER = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const RIGHT_SHOULDER = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const NOSE = landmarks[POSE_LANDMARKS.NOSE];

    // 좌표 변환
    const leftShoulder = { x: LEFT_SHOULDER.x, y: LEFT_SHOULDER.y };
    const rightShoulder = { x: RIGHT_SHOULDER.x, y: RIGHT_SHOULDER.y };
    const nose = { x: NOSE.x, y: NOSE.y };

    // 어깨 기울기
    const shoulderSlope = Math.abs(leftShoulder.y - rightShoulder.y);

    // 머리 위치
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
    const headPosition = nose.y - shoulderCenterY;

    // 자세 판별
    let status = "";
    if (shoulderSlope < 0.05 && headPosition > -0.05 && headPosition < 0.1) {
      status = "정자세";
    } else if (shoulderSlope >= 0.05) {
      status = "기울어짐";
    } else if (headPosition <= -0.1) {
      status = "엎드림";
    } 
    

    // 키포인트 반환
    const keypoints = Object.values(landmarks).map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));

    return { status, keypoints };
  }
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

      // 초록색 선을 그리는 부분
      const landmarkLines = [[0, 1], [1, 2], [0, 4], [4, 5], [11, 12]]
      // console.log(landmarkLines)
      drawConnectors(canvasCtx, results.poseLandmarks, landmarkLines, { 
        color: '#00FF00', // 초록색
        lineWidth: 2,
      });

      console.log(results.poseLandmarks[0])

      // 빨간색 점을 그리는 부분
      drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: 'red',
        lineWidth: 2,
        radius: 3,
      });
      //자세판단코드
      const { status, keypoints } = poseDetect(results.poseLandmarks);
      console.log(status)

      canvasCtx.restore();
    } catch (e) {
      console.log("자리비움")
    }
  }

  useEffect(() => {
    const userPose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    userPose.setOptions({
      selfieMode: true,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    userPose.onResults(onResults);

    if (webcamRef.current && webcamRef.current.video) {
      camera = new cam.Camera(webcamRef.current.video, {
        onFrame: async () => {
          await userPose.send({ image: webcamRef.current.video });
        },
        width: 1280,
        height: 720,
      });
      camera.start();
    }

    return () => {
      if (camera) {
        camera.stop();
      }
    };
  }, []);

  return (
    <div className="App">
      <Webcam
        ref={webcamRef}
        style={{
          position: "absolute",
          marginLeft: "auto",
          marginRight: "auto",
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 9,
          width: '100%',
          height: '100%',
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          marginLeft: "auto",
          marginRight: "auto",
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 9,
          width: '100%',
          height: '100%',
        }}
      ></canvas>
    </div>
  );
};

export default UserPose;
