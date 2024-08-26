import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Eraser, Undo, Redo, Trash, Paintbrush } from 'lucide-react';
import { init, tx, id } from '@instantdb/react';

type Point = { x: number; y: number };

type DrawingAction = {
  id: string;
  type: 'draw' | 'clear' | 'erase';
  paths: Point[][];
  color?: string;
  thickness?: number;
};

const db = init<DrawingAction>({ appId: import.meta.env.VITE_INSTANTDB_APP_ID });

const CollaborativeDrawingBoard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [thickness, setThickness] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [localActions, setLocalActions] = useState<DrawingAction[]>([]);
  const [undoneActions, setUndoneActions] = useState<DrawingAction[]>([]);
  const currentPathRef = useRef<Point[]>([]);

  const { data } = db.useQuery({ drawingActions: {} });
  const drawingActions: any = data?.drawingActions || [];

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (context) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }
  }, []);

  const redrawCanvas = useCallback(
    (actions: DrawingAction[]) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!context) return;

      context.clearRect(0, 0, canvas!.width, canvas!.height);

      actions.forEach((action: DrawingAction) => {
        if (action.paths && (action.type === 'draw' || action.type === 'erase')) {
          action.paths.forEach((path) => {
            if (path.length > 0) {
              context.beginPath();
              context.moveTo(path[0].x, path[0].y);
              path.forEach((point) => {
                context.lineTo(point.x, point.y);
              });
              context.strokeStyle = action.type === 'erase' ? '#FFFFFF' : action.color || color;
              context.lineWidth = action.thickness || thickness;
              context.stroke();
            }
          });
        } else if (action.type === 'clear') {
          context.clearRect(0, 0, canvas!.width, canvas!.height);
        }
      });
    },
    [color, thickness],
  );

  useEffect(() => {
    setLocalActions(drawingActions);
    redrawCanvas(drawingActions);
  }, [drawingActions, redrawCanvas]);

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { offsetX, offsetY } = event.nativeEvent;
    currentPathRef.current = [{ x: offsetX, y: offsetY }];

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (context) {
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      context.strokeStyle = isEraser ? '#FFFFFF' : color;
      context.lineWidth = thickness;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { offsetX, offsetY } = event.nativeEvent;
    currentPathRef.current.push({ x: offsetX, y: offsetY });

    const context = canvas.getContext('2d');
    if (context) {
      context.lineTo(offsetX, offsetY);
      context.strokeStyle = isEraser ? '#FFFFFF' : color;
      context.lineWidth = thickness;
      context.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (currentPathRef.current.length > 0) {
        const newAction: DrawingAction = {
          id: id(),
          type: isEraser ? 'erase' : 'draw',
          paths: [currentPathRef.current],
          color: isEraser ? '#FFFFFF' : color,
          thickness,
        };
        setLocalActions((prev) => [...prev, newAction]);
        setUndoneActions([]); // Clear undone actions when a new action is added
        db.transact(tx.drawingActions[newAction.id].update(newAction));
      }
      currentPathRef.current = [];
    }
  };

  const clearCanvas = () => {
    const clearAction: DrawingAction = {
      id: id(),
      type: 'clear',
      paths: [],
    };
    setLocalActions((prev) => [...prev, clearAction]);
    setUndoneActions([]);
    db.transact(tx.drawingActions[clearAction.id].update(clearAction));
    redrawCanvas([clearAction]);
  };

  const toggleEraser = () => {
    setIsEraser(!isEraser);
  };

  const undo = () => {
    if (localActions.length > 0) {
      const lastAction = localActions[localActions.length - 1];
      setLocalActions((prev) => prev.slice(0, -1));
      setUndoneActions((prev) => [...prev, lastAction]);
      redrawCanvas(localActions.slice(0, -1));
      db.transact(tx.drawingActions[lastAction.id].delete());
    }
  };

  const redo = () => {
    if (undoneActions.length > 0) {
      const actionToRedo = undoneActions[undoneActions.length - 1];
      setUndoneActions((prev) => prev.slice(0, -1));
      setLocalActions((prev) => [...prev, actionToRedo]);
      redrawCanvas([...localActions, actionToRedo]);
      db.transact(tx.drawingActions[actionToRedo.id].update(actionToRedo));
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4 bg-gray-100 rounded-lg shadow-md">
      <canvas
        ref={canvasRef}
        width={1000}
        height={800}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        className="border border-gray-300 rounded-md bg-white shadow-inner"
      />
      <div className="flex items-center space-x-4 bg-white p-4 rounded-md shadow">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-10 h-10 rounded cursor-pointer"
          disabled={isEraser}
        />
        <div className="w-64">
          <Slider
            value={[thickness]}
            onValueChange={(values) => setThickness(values[0])}
            min={1}
            max={30}
            step={1}
            className="w-full"
          />
        </div>
        <span className="text-sm text-gray-600">{thickness}px</span>
        <Button onClick={toggleEraser} variant={isEraser ? 'secondary' : 'outline'} size="icon">
          {isEraser ? <Paintbrush className="h-4 w-4" /> : <Eraser className="h-4 w-4" />}
        </Button>
        <Button onClick={undo} disabled={localActions.length === 0} size="icon">
          <Undo className="h-4 w-4" />
        </Button>
        <Button onClick={redo} disabled={undoneActions.length === 0} size="icon">
          <Redo className="h-4 w-4" />
        </Button>
        <Button onClick={clearCanvas} variant="destructive" size="icon">
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default CollaborativeDrawingBoard;
