import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Eraser, Undo, Redo, Trash, Paintbrush } from 'lucide-react';
import { init, tx, id } from '@instantdb/react';

// 定义 DrawingAction 类型
type DrawingAction = {
  id: string;
  type: 'draw' | 'clear' | 'erase';
  points: { x: number; y: number }[];
  color?: string;
  thickness?: number;
};

// 初始化 InstantDB
const db = init<DrawingAction>({ appId: import.meta.env.VITE_INSTANTDB_APP_ID });

const CollaborativeDrawingBoard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [thickness, setThickness] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [localActions, setLocalActions] = useState<DrawingAction[]>([]);

  // 查询所有绘画动作
  const { data } = db.useQuery({ drawingActions: {} });
  const drawingActions = data?.drawingActions || [];

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
        if (action.points && (action.type === 'draw' || action.type === 'erase')) {
          context.beginPath();
          context.moveTo(action.points[0].x, action.points[0].y);
          action.points.forEach((point) => {
            context.lineTo(point.x, point.y);
          });
          context.strokeStyle = action.type === 'erase' ? '#FFFFFF' : action.color || color;
          context.lineWidth = action.thickness || thickness;
          context.stroke();
        } else if (action.type === 'clear') {
          context.clearRect(0, 0, canvas!.width, canvas!.height);
        }
      });
    },
    [color, thickness],
  );

  useEffect(() => {
    // 当绘画动作发生变化时重新绘制画布
    setLocalActions(drawingActions);
    setCurrentStep(drawingActions.length);
    redrawCanvas(drawingActions);
  }, [drawingActions, redrawCanvas]);

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { offsetX, offsetY } = event.nativeEvent;
    const newAction: DrawingAction = {
      id: id(),
      type: isEraser ? 'erase' : 'draw',
      points: [{ x: offsetX, y: offsetY }],
      color: isEraser ? '#FFFFFF' : color,
      thickness,
    };
    setLocalActions((prev) => [...prev, newAction]);

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (context) {
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      context.lineTo(offsetX, offsetY);
      context.strokeStyle = isEraser ? '#FFFFFF' : color;
      context.lineWidth = thickness;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();
    }
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const { offsetX, offsetY } = event.nativeEvent;

    setLocalActions((prev) => {
      const updatedActions = [...prev];
      const currentAction = { ...updatedActions[updatedActions.length - 1] };
      currentAction.points = [...currentAction.points, { x: offsetX, y: offsetY }];
      updatedActions[updatedActions.length - 1] = currentAction;
      return updatedActions;
    });

    const context = canvas.getContext('2d');
    if (context) {
      context.lineTo(offsetX, offsetY);
      context.strokeStyle = isEraser ? '#FFFFFF' : color;
      context.lineWidth = thickness;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const lastAction = localActions[localActions.length - 1];
      db.transact(tx.drawingActions[lastAction.id].update(lastAction));
    }
  };

  const clearCanvas = () => {
    const clearAction: DrawingAction = {
      id: id(),
      type: 'clear',
      points: [],
    };
    db.transact(tx.drawingActions[clearAction.id].update(clearAction));
  };

  const toggleEraser = () => {
    setIsEraser(!isEraser);
  };

  const undo = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      redrawCanvas(localActions.slice(0, currentStep - 1));
    }
  };

  const redo = () => {
    if (currentStep < localActions.length) {
      setCurrentStep((prev) => prev + 1);
      redrawCanvas(localActions.slice(0, currentStep + 1));
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
        <Button onClick={undo} disabled={currentStep === 0} size="icon">
          <Undo className="h-4 w-4" />
        </Button>
        <Button onClick={redo} disabled={currentStep === localActions.length} size="icon">
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
