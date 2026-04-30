import Modal from "./Modal.jsx";

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger" // danger, primary, success
}) {
  const toneClasses = {
    danger: "bg-rose-600 hover:bg-rose-700",
    primary: "bg-slate-900 hover:bg-slate-800",
    success: "bg-emerald-600 hover:bg-emerald-700"
  }[tone];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">{message}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${toneClasses}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
