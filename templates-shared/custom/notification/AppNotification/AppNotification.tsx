import { useNotification } from "../../../hooks/useNotification";
import classes from "./AppNotification.module.css";

const AppNotification = () => {
  const { notifications, dismiss } = useNotification();
  return (
    <div className={classes.container}>
      {notifications.map((notification) => (
        <div key={notification.id} className={classes.notification}>
          <p>{notification.type}</p>
          <p>{notification.message}</p>
          <button onClick={() => dismiss(notification.id)}>[x]</button>
        </div>
      ))}
    </div>
  );
};

export default AppNotification;

// A Sample use of a notification library
// "use client";

// import { useEffect } from "react";

// import { Toaster, toast } from "sonner";

// import {
//   ApiNotification,
//   NOTIFICATION_EVENT,
// } from "@/api-services/hooks/useNotification";

// const AppNotification = () => {
//   useEffect(() => {
//     const handleNotification = (event: Event) => {
//       const notification = (event as CustomEvent<ApiNotification>).detail;
//       const { type, message } = notification;

//       switch (type) {
//         case "success":
//           toast.success(message);
//           break;
//         case "error":
//           toast.error(message);
//           break;
//         case "warning":
//           toast.warning(message);
//           break;
//         case "info":
//         default:
//           toast.info(message);
//           break;
//       }
//     };

//     window.addEventListener(NOTIFICATION_EVENT, handleNotification);
//     return () => {
//       window.removeEventListener(NOTIFICATION_EVENT, handleNotification);
//     };
//   }, []);

//   return <Toaster position="top-right" richColors />;
// };

// export default AppNotification;
