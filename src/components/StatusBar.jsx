import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useStatus } from '../contexts/StatusContext.jsx';
import Avatar from './Avatar.jsx';
import AddStatusModal from './AddStatusModal.jsx';
import StatusViewer from './StatusViewer.jsx';

export default function StatusBar() {
  const { profile } = useAuth();
  const { myGroup, friendGroups, viewedIds } = useStatus();
  const [showAdd, setShowAdd] = useState(false);
  const [viewingGroup, setViewingGroup] = useState(null);

  function isGroupFullyViewed(group) {
    return group.statuses.every((s) => viewedIds.has(s.id));
  }

  function handleMyCircleClick() {
    if (myGroup && myGroup.statuses.length > 0) {
      setViewingGroup(myGroup);
    } else {
      setShowAdd(true);
    }
  }

  return (
    <div className="status-bar">
      <div className="status-item" onClick={handleMyCircleClick}>
        <div className={`status-ring ${myGroup ? (isGroupFullyViewed(myGroup) ? 'seen' : 'unseen') : 'none'}`}>
          <Avatar url={profile?.avatar_url} name={profile?.username} size={54} />
        </div>
        {!myGroup && (
          <button
            className="status-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowAdd(true);
            }}
            aria-label="Add status"
          >
            +
          </button>
        )}
        <span className="status-item-name">Your status</span>
      </div>

      {friendGroups.map((group) => (
        <div className="status-item" key={group.user.id} onClick={() => setViewingGroup(group)}>
          <div className={`status-ring ${isGroupFullyViewed(group) ? 'seen' : 'unseen'}`}>
            <Avatar url={group.user.avatar_url} name={group.user.username} size={54} />
          </div>
          <span className="status-item-name">{group.user.username}</span>
        </div>
      ))}

      {showAdd && <AddStatusModal onClose={() => setShowAdd(false)} />}
      {viewingGroup && (
        <StatusViewer
          group={viewingGroup}
          isOwn={viewingGroup.user.id === profile?.id}
          onClose={() => setViewingGroup(null)}
          onAddMore={() => {
            setViewingGroup(null);
            setShowAdd(true);
          }}
        />
      )}
    </div>
  );
}
