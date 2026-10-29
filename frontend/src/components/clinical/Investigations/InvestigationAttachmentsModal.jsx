import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Image, Trash2, Download, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import investigationService from '../../../services/investigationService';

export const InvestigationAttachmentsModal = ({ isOpen, onClose, orderId, orderNumber }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload Form
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('image/png');
  const [attachmentType, setAttachmentType] = useState('radiograph');
  const [fileData, setFileData] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    loadAttachments();
  }, [isOpen, orderId]);

  const loadAttachments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await investigationService.getAttachments(orderId);
      setAttachments(res.attachments || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load attachments.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setFileType(file.type || 'application/octet-stream');
    setFileSize(file.size);

    // Auto classify
    if (file.type.startsWith('image/')) {
      setAttachmentType('radiograph');
    } else if (file.type === 'application/pdf') {
      setAttachmentType('pdf_report');
    } else {
      setAttachmentType('other');
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileName) {
      setError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const payload = {
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        file_path: fileData || `/uploads/diagnostics/${fileName}`,
        file_url: fileData || `/uploads/diagnostics/${fileName}`,
        attachment_type: attachmentType,
        description: notes.trim() || null,
        notes: notes.trim() || null,
      };

      await investigationService.uploadAttachment(orderId, payload);
      setFileName('');
      setFileData('');
      setNotes('');
      loadAttachments();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attId) => {
    if (!window.confirm('Are you sure you want to remove this diagnostic attachment?')) return;
    try {
      await investigationService.deleteAttachment(orderId, attId);
      loadAttachments();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete attachment.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">Diagnostic Scans & Attachments</h2>
              <p className="text-xs text-slate-400 font-mono">Order: {orderNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6 text-xs text-slate-700">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Box */}
          <form onSubmit={handleUpload} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
              Upload External Diagnostic Media
            </span>

            <div className="flex items-center space-x-3">
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-4 cursor-pointer bg-white transition text-center">
                <Upload className="w-6 h-6 text-indigo-600 mb-1" />
                <span className="font-semibold text-slate-800">
                  {fileName ? fileName : 'Click to select radiograph, OPG scan or report'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Supported: PNG, JPG, DICOM, PDF (Max 25MB)
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <div className="w-48 space-y-2 shrink-0">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Media Classification
                  </label>
                  <select
                    value={attachmentType}
                    onChange={(e) => setAttachmentType(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="radiograph">Dental Radiograph / X-Ray</option>
                    <option value="opg_panoramic">OPG Panoramic Scan</option>
                    <option value="cbct_volume">CBCT 3D Slice</option>
                    <option value="pdf_report">External Lab PDF</option>
                    <option value="other">Other Record</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={uploading || !fileName}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Save Attachment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Existing Attachments List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Attached Diagnostic Records ({attachments.length})
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                <span>Loading attachments...</span>
              </div>
            ) : attachments.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 italic">
                No external diagnostic scans or files attached to this order yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {attachments.map((att) => (
                  <div key={att.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                        {att.file_type?.startsWith('image/') ? (
                          <Image className="w-5 h-5" />
                        ) : (
                          <FileText className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <a
                          href={att.file_url || att.file_path}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-slate-900 hover:text-indigo-600 hover:underline"
                        >
                          {att.file_name}
                        </a>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {(att.attachment_type || att.description || 'Scan').replace(/_/g, ' ').toUpperCase()} •{' '}
                          {(att.file_size / 1024).toFixed(1)} KB • Uploaded by {att.uploaded_by_name || 'Staff'} on{' '}
                          {new Date(att.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <a
                        href={att.file_url || att.file_path}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="View / Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(att.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Delete attachment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestigationAttachmentsModal;

