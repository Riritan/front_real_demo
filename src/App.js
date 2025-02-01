import * as cam from "@mediapipe/camera_utils";
import { Pose ,POSE_LANDMARKS} from "@mediapipe/pose";
import React, { useEffect, useRef,useState }  from 'react';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import Webcam from 'react-webcam';

const UserPose = () => {
  const [poseText,setPoseText] = useState('');
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  let camera = null;

  // 자세 시간 변수
  const LEAVE_TIME_SEC = 5; // 자리 비움 설정 시간 (초단위)

  // 자리비움 측정 시작 시간
  const startTimeRef = useRef(Date.now());
  // 자리비움 측정 여부
  const checkLeaveRef = useRef(false);
  // 자리비움 측정 함수
  const leaveTimeoutRef = useRef(null);
  
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
    setPoseText(status);

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

      // 자리비움 측정 중일 경우, 사람이 인식된 경우 -> 자리비움이 아님
      if (checkLeaveRef.current) {
        // 자리비움 측정을 종료한다
        checkLeaveRef.current = false;
        setPoseText(status);

        // 자리비움 측정 함수가 존재할 경우 해당 함수를 없앰
        if (leaveTimeoutRef.current) {
          clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
        }
      }

      canvasCtx.restore();
    } catch (e) {
      // console.log("자리비움")
      // setPoseText('자리비움')

      // checkLeaveRef.current는 checkLeaveRef 안의 변수를 의미함
      // 자리비움 측정 중일 경우 무시함
      if (checkLeaveRef.current) return;

      // 자리비움 측졍 여부 변경
      checkLeaveRef.current = true;
      // 자리비움 측정 시작 시간 변경
      startTimeRef.current = Date.now();

      // 자리비움 측정 함수
      leaveTimeoutRef.current = setTimeout(() => {
        setPoseText('자리비움');
        checkLeaveRef.current = false;
      }, LEAVE_TIME_SEC * 1000); // ms
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
      <div
        style={{
          position: "absolute",
          marginLeft: "auto",
          marginRight: "auto",
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 15,
          width: '100%',
          fontWeight: 'bolder',
          fontSize: '2rem',
          color: 'red',
        }}
      >{poseText}</div>
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
