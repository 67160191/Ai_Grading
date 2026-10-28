import { useEffect, useState } from "react";
import { getSubmissionFile } from "../api/grading";

// รูปภาพต้องผ่าน authenticated request (auth ใช้ header เท่านั้น ไม่มี cookie/query fallback)
// จึงโหลดเป็น blob ผ่าน axios แล้วแปลงเป็น object URL แทนการใช้ <img src="..."> ตรงๆ
export default function SubmissionImage({ submissionId, className }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl;
    setError(false);
    getSubmissionFile(submissionId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [submissionId]);

  if (error) {
    return <p className="text-sm text-red-500">ไม่สามารถโหลดรูปภาพได้</p>;
  }
  if (!url) {
    return <p className="text-sm text-gray-400">กำลังโหลดรูปภาพ...</p>;
  }
  return <img src={url} alt="งานที่ส่ง" className={className} />;
}
